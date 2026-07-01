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
  groupName: string | null;
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

  async search(query: AvailabilityQueryDto): Promise<AvailabilityResultItem[]> {
    const nights = this.enumerateDates(query.checkIn, query.checkOut);
    if (nights.length === 0) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

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
    if (candidates.length === 0) return [];

    const listingIds = candidates.map((l) => l.id);
    const cachedDays = await this.prisma.calendarDay.findMany({
      where: {
        listingId: { in: listingIds },
        date: { in: nights },
      },
    });

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
      const hasAllNights = (daysByListing.get(listing.id)?.length ?? 0) >= nights.length;
      const cacheFresh =
        latest && Date.now() - latest.getTime() < this.cacheMaxAgeMs;
      return !hasAllNights || !cacheFresh;
    });

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

    const refreshedDays =
      staleListings.length > 0
        ? await this.prisma.calendarDay.findMany({
            where: {
              listingId: { in: listingIds },
              date: { in: nights },
            },
          })
        : cachedDays;

    const refreshedByListing = new Map<string, typeof refreshedDays>();
    for (const day of refreshedDays) {
      const bucket = refreshedByListing.get(day.listingId) ?? [];
      bucket.push(day);
      refreshedByListing.set(day.listingId, bucket);
    }

    const results: AvailabilityResultItem[] = candidates.map((listing) => {
      const days = refreshedByListing.get(listing.id) ?? [];
      return {
        listingId: listing.hostawayId,
        name: listing.name,
        city: listing.city,
        maxGuests: listing.personCapacity,
        bedrooms: listing.bedroomsNumber,
        roomType: listing.roomType,
        petsAllowed: listing.petsAllowed,
        available: this.isStayAvailable(days, nights.length),
        groupName: listing.listingGroup?.name ?? null,
      };
    });

    const sorted = results.sort((a, b) => Number(b.available) - Number(a.available));
    if (query.availableOnly) {
      return sorted.filter((r) => r.available);
    }
    return sorted;
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
