import { Injectable, Logger } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { hashPhoneForStorage, hashValue, maskGuestName } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { HostawayClient } from './hostaway.client';
import {
  EXCLUDED_LISTING_IDS,
  LISTING_HIERARCHY,
  resolveParentHostawayId,
} from './listing-hierarchy.config';

@Injectable()
export class HostawaySyncService {
  private readonly logger = new Logger(HostawaySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostaway: HostawayClient,
  ) {}

  async syncAll(): Promise<{ listings: number; reservations: number }> {
    const job = await this.prisma.syncJob.create({
      data: { jobType: 'full_sync', status: 'running' },
    });

    try {
      await this.syncListingGroups();
      const listings = await this.syncListings();
      const reservations = await this.syncRecentReservations();
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          metadata: { listings, reservations },
        },
      });
      return { listings, reservations };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      throw error;
    }
  }

  private async syncListingGroups() {
    for (const group of LISTING_HIERARCHY) {
      await this.prisma.listingGroup.upsert({
        where: { hostawayParentId: group.parentHostawayId },
        create: {
          hostawayParentId: group.parentHostawayId,
          name: group.name,
          city: group.city,
          availabilityMode: group.availabilityMode,
        },
        update: {
          name: group.name,
          city: group.city,
          availabilityMode: group.availabilityMode,
        },
      });
    }
  }

  async syncListings(): Promise<number> {
    const remoteListings = await this.hostaway.getListings(100, 0);
    let count = 0;

    for (const remote of remoteListings) {
      const tags = (remote.listingTags ?? []).map((t) => t.name);
      const petsAllowed = (remote.listingAmenities ?? []).some(
        (a) => a.amenityName.toLowerCase().includes('pet'),
      );
      const parentHostawayId = resolveParentHostawayId(remote.id);
      const group = parentHostawayId
        ? await this.prisma.listingGroup.findUnique({
            where: { hostawayParentId: parentHostawayId },
          })
        : null;

      const status = this.mapListingStatus(remote.specialStatus);
      const isBookable =
        status === ListingStatus.LIVE &&
        !EXCLUDED_LISTING_IDS.includes(remote.id);

      await this.prisma.listing.upsert({
        where: { hostawayId: remote.id },
        create: {
          hostawayId: remote.id,
          name: remote.name,
          city: remote.city,
          region: remote.state,
          personCapacity: remote.personCapacity ?? 1,
          bedroomsNumber: remote.bedroomsNumber,
          roomType: remote.roomType,
          petsAllowed,
          status,
          isBookable,
          listingGroupId: group?.id,
          parentHostawayId,
          tags,
          lastSyncedAt: new Date(),
        },
        update: {
          name: remote.name,
          city: remote.city,
          region: remote.state,
          personCapacity: remote.personCapacity ?? 1,
          bedroomsNumber: remote.bedroomsNumber,
          roomType: remote.roomType,
          petsAllowed,
          status,
          isBookable,
          listingGroupId: group?.id,
          parentHostawayId,
          tags,
          lastSyncedAt: new Date(),
        },
      });
      count++;
    }

    this.logger.log(`Synced ${count} listings`);
    return count;
  }

  async syncListingCalendar(
    hostawayListingId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const listing = await this.prisma.listing.findUnique({
      where: { hostawayId: hostawayListingId },
    });
    if (!listing) return 0;

    const days = await this.hostaway.getCalendar(
      hostawayListingId,
      startDate,
      endDate,
    );

    for (const day of days) {
      const date = new Date(day.date);
      await this.prisma.calendarDay.upsert({
        where: {
          listingId_date: { listingId: listing.id, date },
        },
        create: {
          listingId: listing.id,
          date,
          isAvailable: day.isAvailable === 1,
          minNights: day.minimumStay,
          price: day.price,
        },
        update: {
          isAvailable: day.isAvailable === 1,
          minNights: day.minimumStay,
          price: day.price,
          syncedAt: new Date(),
        },
      });
    }

    return days.length;
  }

  async syncRecentReservations(): Promise<number> {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 7);
    const future = new Date(today);
    future.setDate(future.getDate() + 180);

    const format = (d: Date) => d.toISOString().slice(0, 10);
    const reservations = await this.hostaway.getReservations({
      limit: 100,
      arrivalStartDate: format(past),
      arrivalEndDate: format(future),
    });

    let count = 0;
    for (const remote of reservations) {
      const listing = await this.prisma.listing.findUnique({
        where: { hostawayId: remote.listingMapId },
      });
      if (!listing) continue;

      const conversationId =
        await this.hostaway.findConversationByReservation(remote.id);

      await this.prisma.reservation.upsert({
        where: { hostawayId: remote.id },
        create: {
          hostawayId: remote.id,
          listingId: listing.id,
          arrivalDate: new Date(remote.arrivalDate),
          departureDate: new Date(remote.departureDate),
          numberOfGuests: remote.numberOfGuests,
          adults: remote.adults,
          children: remote.children,
          pets: remote.pets,
          status: remote.status,
          phoneHash: remote.phone ? hashPhoneForStorage(remote.phone) : null,
          emailHash: remote.guestEmail
            ? hashValue(remote.guestEmail)
            : null,
          guestNameMasked: remote.guestName
            ? maskGuestName(remote.guestName)
            : null,
          guestFirstNameHint:
            remote.guestFirstName?.trim() ||
            remote.guestName?.trim().split(/\s+/)[0] ||
            null,
          hostawayConversationId: conversationId,
          lastSyncedAt: new Date(),
        },
        update: {
          listingId: listing.id,
          arrivalDate: new Date(remote.arrivalDate),
          departureDate: new Date(remote.departureDate),
          numberOfGuests: remote.numberOfGuests,
          adults: remote.adults,
          children: remote.children,
          pets: remote.pets,
          status: remote.status,
          phoneHash: remote.phone ? hashPhoneForStorage(remote.phone) : null,
          emailHash: remote.guestEmail
            ? hashValue(remote.guestEmail)
            : null,
          guestNameMasked: remote.guestName
            ? maskGuestName(remote.guestName)
            : null,
          guestFirstNameHint:
            remote.guestFirstName?.trim() ||
            remote.guestName?.trim().split(/\s+/)[0] ||
            null,
          hostawayConversationId: conversationId ?? undefined,
          lastSyncedAt: new Date(),
        },
      });
      count++;
    }

    this.logger.log(`Synced ${count} reservations`);
    return count;
  }

  private mapListingStatus(specialStatus: string | null): ListingStatus {
    if (!specialStatus) return ListingStatus.LIVE;
    const normalized = specialStatus.toLowerCase();
    if (normalized.includes('draft') || normalized.includes('entwurf')) {
      return ListingStatus.DRAFT;
    }
    if (
      normalized.includes('hidden') ||
      normalized.includes('ausgeblendet')
    ) {
      return ListingStatus.HIDDEN;
    }
    return ListingStatus.UNKNOWN;
  }
}
