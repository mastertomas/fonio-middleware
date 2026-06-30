import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingStatus } from '@prisma/client';
import { hashPhoneForStorage, hashValue, maskGuestName } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { HostawayClient } from './hostaway.client';
import { EXCLUDED_LISTING_IDS } from './listing-hierarchy.config';
import { ListingHierarchyService } from './listing-hierarchy.service';

@Injectable()
export class HostawaySyncService implements OnModuleInit {
  private readonly logger = new Logger(HostawaySyncService.name);
  private syncInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostaway: HostawayClient,
    private readonly hierarchy: ListingHierarchyService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const stale = await this.prisma.syncJob.updateMany({
      where: { status: 'running' },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: 'Interrupted — server restarted or sync did not finish',
      },
    });
    if (stale.count > 0) {
      this.logger.warn(`Marked ${stale.count} stale sync job(s) as failed`);
    }
  }

  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }

  async syncAll(jobType = 'full_sync'): Promise<{
    listings: number;
    reservations: number;
    calendarDays: number;
    removedListings: number;
  }> {
    if (this.syncInProgress) {
      throw new ConflictException('Hostaway sync is already running');
    }

    this.syncInProgress = true;
    const job = await this.prisma.syncJob.create({
      data: { jobType, status: 'running', metadata: { phase: 'listings' } },
    });

    try {
      const remoteListings = await this.hostaway.getAllListings();
      await this.syncListingGroups(remoteListings);
      const listings = await this.syncListings(remoteListings);
      const removedListings = await this.removeStaleListings(remoteListings);
      await this.updateJobProgress(job.id, {
        phase: 'reservations',
        listings,
        removedListings,
      });

      const reservations = await this.syncAllReservations(job.id);
      await this.updateJobProgress(job.id, {
        phase: 'calendars',
        listings,
        reservations,
        removedListings,
      });

      const calendarDays = await this.syncAllCalendars(job.id);
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          metadata: {
            phase: 'done',
            listings,
            reservations,
            calendarDays,
            removedListings,
          },
        },
      });
      return { listings, reservations, calendarDays, removedListings };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  private async updateJobProgress(
    jobId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { metadata: metadata as object },
    });
  }

  private async syncListingGroups(
    remotes?: Awaited<ReturnType<HostawayClient['getAllListings']>>,
  ) {
    const remoteListings = remotes ?? (await this.hostaway.getAllListings());
    const groups = await this.hierarchy.discoverGroups(remoteListings);

    for (const group of groups) {
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

  async syncListings(
    remotes?: Awaited<ReturnType<HostawayClient['getAllListings']>>,
  ): Promise<number> {
    const remoteListings = remotes ?? (await this.hostaway.getAllListings());
    let count = 0;

    for (const remote of remoteListings) {
      const tags = (remote.listingTags ?? []).map((t) => t.name);
      const petsAllowed = (remote.listingAmenities ?? []).some((a) =>
        a.amenityName.toLowerCase().includes('pet'),
      );
      const parentHostawayId = this.hierarchy.resolveParent(remote.id);
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

  private async removeStaleListings(
    remotes: Awaited<ReturnType<HostawayClient['getAllListings']>>,
  ): Promise<number> {
    const remoteIds = new Set(remotes.map((l) => l.id));
    const local = await this.prisma.listing.findMany({
      select: { id: true, hostawayId: true, status: true },
    });
    let removed = 0;
    for (const listing of local) {
      if (!remoteIds.has(listing.hostawayId) && listing.status !== ListingStatus.HIDDEN) {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: ListingStatus.HIDDEN, isBookable: false },
        });
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(`Marked ${removed} removed Hostaway listings as hidden`);
    }
    return removed;
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

  private async syncAllCalendars(jobId?: string): Promise<number> {
    const daysAhead = Number(this.config.get('CALENDAR_SYNC_DAYS') ?? 365);
    const listings = await this.prisma.listing.findMany({
      where: { isBookable: true },
    });
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);
    const format = (d: Date) => d.toISOString().slice(0, 10);
    let total = 0;

    for (let i = 0; i < listings.length; i += 1) {
      const listing = listings[i];
      try {
        total += await this.syncListingCalendar(
          listing.hostawayId,
          format(today),
          format(end),
        );
        if (jobId && (i === 0 || (i + 1) % 5 === 0 || i === listings.length - 1)) {
          await this.updateJobProgress(jobId, {
            phase: 'calendars',
            calendarListing: i + 1,
            calendarTotal: listings.length,
            calendarDays: total,
          });
        }
        await this.sleep(250);
      } catch (error) {
        this.logger.warn(
          `Calendar sync failed for listing ${listing.hostawayId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(`Synced ${total} calendar days across ${listings.length} listings`);
    return total;
  }

  async syncAllReservations(jobId?: string): Promise<number> {
    const reservations = await this.hostaway.getAllReservations({});
    return this.upsertReservations(reservations, { skipConversations: true, jobId });
  }

  async syncRecentReservations(): Promise<number> {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 7);
    const future = new Date(today);
    future.setDate(future.getDate() + 180);
    const format = (d: Date) => d.toISOString().slice(0, 10);
    const reservations = await this.hostaway.getAllReservations({
      arrivalStartDate: format(past),
      arrivalEndDate: format(future),
    });
    return this.upsertReservations(reservations);
  }

  private async upsertReservations(
    reservations: Awaited<ReturnType<HostawayClient['getAllReservations']>>,
    options?: { skipConversations?: boolean; jobId?: string },
  ): Promise<number> {
    let count = 0;
    const total = reservations.length;
    for (const remote of reservations) {
      const listing = await this.prisma.listing.findUnique({
        where: { hostawayId: remote.listingMapId },
      });
      if (!listing) continue;

      const conversationId = options?.skipConversations
        ? undefined
        : await this.hostaway.findConversationByReservation(remote.id);

      const conversationData =
        conversationId !== undefined
          ? { hostawayConversationId: conversationId }
          : {};

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
          guestPhone: remote.phone?.trim() || null,
          guestEmail: remote.guestEmail?.trim() || null,
          guestName: remote.guestName?.trim() || null,
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
          hostawayConversationId: conversationId ?? null,
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
          guestPhone: remote.phone?.trim() || null,
          guestEmail: remote.guestEmail?.trim() || null,
          guestName: remote.guestName?.trim() || null,
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
          ...conversationData,
          lastSyncedAt: new Date(),
        },
      });
      count++;

      if (
        options?.jobId &&
        (count === 1 || count % 200 === 0 || count === total)
      ) {
        await this.updateJobProgress(options.jobId, {
          phase: 'reservations',
          reservationsDone: count,
          reservationsTotal: total,
        });
        this.logger.log(`Reservation sync progress: ${count}/${total}`);
      }
    }

    this.logger.log(`Synced ${count} reservations`);
    return count;
  }

  async refreshReservationConversation(hostawayReservationId: number) {
    const conversationId =
      await this.hostaway.findConversationByReservation(hostawayReservationId);
    if (!conversationId) {
      return { hostawayConversationId: null, messages: [] };
    }

    await this.prisma.reservation.update({
      where: { hostawayId: hostawayReservationId },
      data: { hostawayConversationId: conversationId, lastSyncedAt: new Date() },
    });

    const messages = await this.hostaway.getConversationMessages(conversationId, 50);
    return { hostawayConversationId: conversationId, messages };
  }

  async syncFromWebhook(
    event: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ listings: number; reservations: number }> {
    const job = await this.prisma.syncJob.create({
      data: { jobType: `webhook:${event}`, status: 'running' },
    });

    try {
      let listings = 0;
      let reservations = 0;
      const normalized = event.toLowerCase();
      if (normalized.includes('reservation')) {
        reservations = await this.syncRecentReservations();
      }
      if (normalized.includes('listing')) {
        listings = await this.syncListings();
      }
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          metadata: { listings, reservations, ...metadata },
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

  private mapListingStatus(specialStatus: string | null): ListingStatus {
    if (!specialStatus) return ListingStatus.LIVE;
    const normalized = specialStatus.toLowerCase();
    if (normalized.includes('draft') || normalized.includes('entwurf')) {
      return ListingStatus.DRAFT;
    }
    if (
      normalized.includes('hidden') ||
      normalized.includes('ausgeblendet') ||
      normalized.includes('archived')
    ) {
      return ListingStatus.HIDDEN;
    }
    return ListingStatus.UNKNOWN;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
