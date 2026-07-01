import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mapWithConcurrency } from '../common/utils/concurrency.util';
import { PrismaService } from '../prisma/prisma.service';
import { HostawayClient } from './hostaway.client';

@Injectable()
export class HostawayConversationService {
  private readonly logger = new Logger(HostawayConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostaway: HostawayClient,
    private readonly config: ConfigService,
  ) {}

  /** Return cached or freshly resolved Hostaway conversation ID for a reservation. */
  async resolveConversationId(hostawayReservationId: number): Promise<number | null> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: hostawayReservationId },
      select: { id: true, hostawayConversationId: true },
    });
    if (!reservation) return null;
    if (reservation.hostawayConversationId) {
      return reservation.hostawayConversationId;
    }

    const conversationId =
      await this.hostaway.findConversationByReservation(hostawayReservationId);
    if (!conversationId) return null;

    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { hostawayConversationId: conversationId, lastSyncedAt: new Date() },
    });
    this.logger.log(
      `Linked reservation ${hostawayReservationId} to conversation ${conversationId}`,
    );
    return conversationId;
  }

  /**
   * Link upcoming/active reservations that lack a conversation ID.
   * Called after reservation sync so inbox forwarding works reliably.
   */
  async backfillMissing(): Promise<{ linked: number; stillMissing: number }> {
    const limit = Number(this.config.get('CONVERSATION_BACKFILL_LIMIT') ?? 200);
    const concurrency = Number(
      this.config.get('CONVERSATION_BACKFILL_CONCURRENCY') ?? 5,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hostawayConversationId: null,
        departureDate: { gte: today },
        NOT: { status: { in: ['cancelled', 'declined', 'expired'] } },
      },
      select: { hostawayId: true },
      take: limit,
      orderBy: { arrivalDate: 'asc' },
    });

    let linked = 0;
    await mapWithConcurrency(reservations, concurrency, async (row) => {
      const id = await this.resolveConversationId(row.hostawayId);
      if (id) linked += 1;
    });

    const stillMissing = reservations.length - linked;
    if (reservations.length > 0) {
      this.logger.log(
        `Conversation backfill: ${linked} linked, ${stillMissing} still without inbox`,
      );
    }
    return { linked, stillMissing };
  }
}
