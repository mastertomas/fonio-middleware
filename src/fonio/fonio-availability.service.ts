import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityMode, Listing, ListingGroup, Prisma } from '@prisma/client';
import { mapWithConcurrency } from '../common/utils/concurrency.util';
import { PrismaService } from '../prisma/prisma.service';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

export interface AvailabilityResultItem {
  listingId: number;
  name: string;
  city: string | null;
  maxGuests: number;
  bedrooms: number | null;
  roomType: string | null;
  petsAllowed: boolean;
  available: boolean;
  /** True when calendar cache is incomplete and live refresh was not requested. */
  availabilityUnknown?: boolean;
  groupName: string | null;
}

export interface AvailabilitySearchResult {
  checkIn: string;
  checkOut: string;
  guests: number;
  results: AvailabilityResultItem[];
  availableCount: number;
  meta: {
    dataSource: 'cache' | 'live';
    responseMs: number;
    listingsChecked: number;
    cacheIncomplete: number;
    hint?: string;
  };
}

type ListingWithGroup = Listing & { listingGroup: ListingGroup | null };

@Injectable()
export class FonioAvailabilityService {
  private readonly cacheMaxAgeMs = 6 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
    private readonly config: ConfigService,
  ) {}

  async search(query: AvailabilityQueryDto): Promise<AvailabilitySearchResult> {
    const started = Date.now();
    const nights = this.enumerateDates(query.checkIn, query.checkOut);
    if (nights.length === 0) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const liveRefresh =
      query.liveRefresh === true ||
      this.config.get('AVAILABILITY_LIVE_REFRESH_DEFAULT') === 'true';

    const where: Prisma.ListingWhereInput = {
      isBookable: true,
      personCapacity: { gte: query.guests },
    };

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.region) {
      where.region = { contains: query.region, mode: 'insensitive' };
    }
    if (query.pets) {
      where.petsAllowed = true;
    }
    if (query.bedrooms) {
      where.bedroomsNumber = { gte: query.bedrooms };
    }
    if (query.roomType) {
      where.roomType = query.roomType;
    }

    const listings = await this.prisma.listing.findMany({
      where,
      include: { listingGroup: true },
      take: 100,
    });

    const candidates = listings.filter((l) => this.isVisibleForGroupMode(l));
    if (candidates.length === 0) {
      return this.wrapResponse(query, [], started, 'cache', 0);
    }

    const listingIds = candidates.map((l) => l.id);
    let cachedDays = await this.prisma.calendarDay.findMany({
      where: {
        listingId: { in: listingIds },
        date: { in: nights },
      },
    });

    const { daysByListing, staleListings } = this.indexCalendarDays(
      cachedDays,
      candidates,
      nights,
    );

    if (liveRefresh && staleListings.length > 0) {
      const syncConcurrency = Number(
        this.config.get('AVAILABILITY_SYNC_CONCURRENCY') ?? 3,
      );
      await mapWithConcurrency(staleListings, syncConcurrency, async (listing) => {
        await this.sync.syncListingCalendar(
          listing.hostawayId,
          query.checkIn,
          query.checkOut,
        );
      });
      cachedDays = await this.prisma.calendarDay.findMany({
        where: {
          listingId: { in: listingIds },
          date: { in: nights },
        },
      });
    }

    const { daysByListing: finalDays } = this.indexCalendarDays(
      cachedDays,
      candidates,
      nights,
    );

    const results: AvailabilityResultItem[] = candidates.map((listing) => {
      const days = finalDays.get(listing.id) ?? [];
      const cacheComplete = days.length >= nights.length;
      const available = cacheComplete && this.isStayAvailable(days, nights.length);
      return {
        listingId: listing.hostawayId,
        name: listing.name,
        city: listing.city,
        maxGuests: listing.personCapacity,
        bedrooms: listing.bedroomsNumber,
        roomType: listing.roomType,
        petsAllowed: listing.petsAllowed,
        available,
        availabilityUnknown: !liveRefresh && !cacheComplete,
        groupName: listing.listingGroup?.name ?? null,
      };
    });

    const sorted = results.sort((a, b) => Number(b.available) - Number(a.available));
    const filtered = query.availableOnly
      ? sorted.filter((r) => r.available)
      : sorted;

    const cacheIncomplete = results.filter((r) => r.availabilityUnknown).length;

    return this.wrapResponse(
      query,
      filtered,
      started,
      liveRefresh ? 'live' : 'cache',
      cacheIncomplete,
    );
  }

  private wrapResponse(
    query: AvailabilityQueryDto,
    results: AvailabilityResultItem[],
    started: number,
    dataSource: 'cache' | 'live',
    cacheIncomplete: number,
  ): AvailabilitySearchResult {
    const hint =
      dataSource === 'cache' && cacheIncomplete > 0
        ? 'Some listings have incomplete calendar cache. Run Hostaway sync or use liveRefresh=true for live Hostaway lookup (slower).'
        : undefined;

    return {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests,
      results,
      availableCount: results.filter((r) => r.available).length,
      meta: {
        dataSource,
        responseMs: Date.now() - started,
        listingsChecked: results.length,
        cacheIncomplete,
        hint,
      },
    };
  }

  private indexCalendarDays(
    cachedDays: {
      listingId: string;
      date: Date;
      isAvailable: boolean;
      minNights: number | null;
      syncedAt: Date;
    }[],
    candidates: ListingWithGroup[],
    nights: Date[],
  ) {
    const daysByListing = new Map<string, typeof cachedDays>();
    const latestSyncByListing = new Map<string, Date>();

    for (const day of cachedDays) {
      const bucket = daysByListing.get(day.listingId) ?? [];
      bucket.push(day);
      daysByListing.set(day.listingId, bucket);
      const prev = latestSyncByListing.get(day.listingId);
      if (!prev || day.syncedAt > prev) {
        latestSyncByListing.set(day.listingId, day.syncedAt);
      }
    }

    const staleListings = candidates.filter((listing) => {
      const latest = latestSyncByListing.get(listing.id);
      const hasAllNights =
        (daysByListing.get(listing.id)?.length ?? 0) >= nights.length;
      const cacheFresh =
        latest && Date.now() - latest.getTime() < this.cacheMaxAgeMs;
      return !hasAllNights || !cacheFresh;
    });

    return { daysByListing, staleListings };
  }

  /** Respect PARENT_ONLY / CHILDREN_ONLY / BOTH from listing groups. */
  private isVisibleForGroupMode(listing: ListingWithGroup): boolean {
    const group = listing.listingGroup;
    if (!group) return true;

    switch (group.availabilityMode) {
      case AvailabilityMode.PARENT_ONLY:
        return listing.hostawayId === group.hostawayParentId;
      case AvailabilityMode.CHILDREN_ONLY:
        return (
          listing.parentHostawayId !== null &&
          listing.hostawayId !== group.hostawayParentId
        );
      default:
        return true;
    }
  }

  private isStayAvailable(
    days: { isAvailable: boolean; minNights: number | null }[],
    stayNights: number,
  ): boolean {
    if (days.length !== stayNights) return false;
    if (!days.every((d) => d.isAvailable)) return false;
    const requiredMin = Math.max(...days.map((d) => d.minNights ?? 1), 1);
    return stayNights >= requiredMin;
  }

  private enumerateDates(checkIn: string, checkOut: string): Date[] {
    const dates: Date[] = [];
    const current = this.parseDateOnly(checkIn);
    const end = this.parseDateOnly(checkOut);
    while (current < end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  private parseDateOnly(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
}
