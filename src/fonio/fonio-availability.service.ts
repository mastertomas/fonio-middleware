import { BadRequestException, Injectable } from '@nestjs/common';
import { AvailabilityMode, Listing, ListingGroup, Prisma } from '@prisma/client';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
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
    const results: AvailabilityResultItem[] = [];

    for (const listing of candidates) {
      const cached = await this.prisma.calendarDay.findFirst({
        where: { listingId: listing.id, date: { in: nights } },
        orderBy: { syncedAt: 'desc' },
      });
      const cacheMaxAgeMs = 6 * 60 * 60 * 1000;
      const cacheFresh =
        cached && Date.now() - cached.syncedAt.getTime() < cacheMaxAgeMs;

      if (!cacheFresh) {
        await this.sync.syncListingCalendar(
          listing.hostawayId,
          query.checkIn,
          query.checkOut,
        );
      }

      const days = await this.prisma.calendarDay.findMany({
        where: {
          listingId: listing.id,
          date: { in: nights },
        },
      });

      const available = this.isStayAvailable(days, nights.length);

      results.push({
        listingId: listing.hostawayId,
        name: listing.name,
        city: listing.city,
        maxGuests: listing.personCapacity,
        bedrooms: listing.bedroomsNumber,
        roomType: listing.roomType,
        petsAllowed: listing.petsAllowed,
        available,
        groupName: listing.listingGroup?.name ?? null,
      });
    }

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
