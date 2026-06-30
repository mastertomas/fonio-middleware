import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
}

@Injectable()
export class FonioAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
  ) {}

  async search(query: AvailabilityQueryDto): Promise<AvailabilityResultItem[]> {
    const where: Prisma.ListingWhereInput = {
      isBookable: true,
      personCapacity: { gte: query.guests },
    };

    if (query.city) {
      where.city = { equals: query.city, mode: 'insensitive' };
    }
    if (query.region) {
      where.region = { equals: query.region, mode: 'insensitive' };
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

    const listings = await this.prisma.listing.findMany({ where, take: 50 });
    const checkIn = new Date(query.checkIn);
    const checkOut = new Date(query.checkOut);
    const nights = this.enumerateDates(checkIn, checkOut);

    const results: AvailabilityResultItem[] = [];

    for (const listing of listings) {
      const cached = await this.prisma.calendarDay.findFirst({
        where: { listingId: listing.id, date: { in: nights } },
        orderBy: { syncedAt: 'desc' },
      });
      const cacheMaxAgeMs = 6 * 60 * 60 * 1000;
      const cacheFresh =
        cached &&
        Date.now() - cached.syncedAt.getTime() < cacheMaxAgeMs;

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

      const available =
        days.length === nights.length &&
        days.every((d) => d.isAvailable === true);

      results.push({
        listingId: listing.hostawayId,
        name: listing.name,
        city: listing.city,
        maxGuests: listing.personCapacity,
        bedrooms: listing.bedroomsNumber,
        roomType: listing.roomType,
        petsAllowed: listing.petsAllowed,
        available,
      });
    }

    return results.sort((a, b) => Number(b.available) - Number(a.available));
  }

  private enumerateDates(checkIn: Date, checkOut: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(checkIn);
    while (current < checkOut) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
}
