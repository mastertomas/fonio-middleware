import { Injectable, Logger } from '@nestjs/common';
import { HostawayClient } from './hostaway.client';
import { GuestRequestInboxService } from './guest-request-inbox.service';
import { HostawayGuestCharge } from './hostaway.types';
import { PrismaService } from '../prisma/prisma.service';

const PAID_CHARGE_STATUSES = new Set(['paid']);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Überweisung',
  cash: 'Barzahlung',
  credit_card: 'Kreditkarte',
  credit_card_online: 'Online-Kreditkarte',
  check: 'Scheck',
  paypal: 'PayPal',
  other: 'Sonstige',
};

export interface ProcessPaymentUpdatesResult {
  reservationHostawayId: number;
  baselined: boolean;
  newPaidCharges: number;
  inboxPosted: number;
  inboxPending: number;
}

@Injectable()
export class PaymentInboxService {
  private readonly logger = new Logger(PaymentInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostaway: HostawayClient,
    private readonly inbox: GuestRequestInboxService,
  ) {}

  async processReservationPaymentUpdates(
    reservationHostawayId: number,
  ): Promise<ProcessPaymentUpdatesResult | null> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: reservationHostawayId },
      include: { notifiedCharges: true },
    });
    if (!reservation) {
      this.logger.debug(
        `Skipping payment inbox check — reservation ${reservationHostawayId} not in local DB`,
      );
      return null;
    }

    let charges: HostawayGuestCharge[];
    try {
      charges = await this.hostaway.getGuestCharges(reservationHostawayId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load guest charges';
      this.logger.warn(
        `Could not load charges for reservation ${reservationHostawayId}: ${message}`,
      );
      return null;
    }

    const paidCharges = charges.filter((charge) =>
      PAID_CHARGE_STATUSES.has(String(charge.status ?? '').toLowerCase()),
    );
    const knownChargeIds = new Set(
      reservation.notifiedCharges.map((entry) => entry.hostawayChargeId),
    );

    if (!reservation.paymentBaselinedAt) {
      const baselineRows = paidCharges
        .filter((charge) => !knownChargeIds.has(charge.id))
        .map((charge) => ({
          hostawayChargeId: charge.id,
          reservationId: reservation.id,
          amount: charge.amount ?? 0,
          currency: charge.currency ?? 'EUR',
          inboxPosted: false,
        }));

      if (baselineRows.length > 0) {
        await this.prisma.notifiedGuestCharge.createMany({
          data: baselineRows,
          skipDuplicates: true,
        });
      }

      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { paymentBaselinedAt: new Date() },
      });

      this.logger.log(
        `Baselined ${baselineRows.length} existing paid charge(s) for reservation ${reservationHostawayId}`,
      );

      return {
        reservationHostawayId,
        baselined: true,
        newPaidCharges: 0,
        inboxPosted: 0,
        inboxPending: 0,
      };
    }

    const newPaidCharges = paidCharges.filter(
      (charge) => !knownChargeIds.has(charge.id),
    );

    let inboxPosted = 0;
    let inboxPending = 0;

    for (const charge of newPaidCharges) {
      const amount = charge.amount ?? 0;
      const currency = charge.currency ?? 'EUR';
      const occurredAt = this.resolveChargeTimestamp(charge);
      const inboxResult = await this.inbox.notifyPaymentReceived({
        reservationHostawayId,
        amount,
        currency,
        occurredAt,
        paymentMethodLabel: this.paymentMethodLabel(charge.paymentMethod),
        source: 'hostaway',
      });

      await this.prisma.notifiedGuestCharge.create({
        data: {
          hostawayChargeId: charge.id,
          reservationId: reservation.id,
          amount,
          currency,
          inboxPosted: inboxResult.posted,
          hostawayMessageId: inboxResult.messageId,
        },
      });

      if (inboxResult.posted) inboxPosted += 1;
      else inboxPending += 1;
    }

    if (newPaidCharges.length > 0) {
      this.logger.log(
        `Payment inbox for reservation ${reservationHostawayId}: ${inboxPosted} posted, ${inboxPending} pending (${newPaidCharges.length} new paid charge(s))`,
      );
    }

    return {
      reservationHostawayId,
      baselined: false,
      newPaidCharges: newPaidCharges.length,
      inboxPosted,
      inboxPending,
    };
  }

  async recordNotifiedCharge(params: {
    reservationHostawayId: number;
    hostawayChargeId: number;
    amount: number;
    currency?: string;
    inboxPosted: boolean;
    hostawayMessageId?: number;
  }) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: params.reservationHostawayId },
    });
    if (!reservation) return;

    await this.prisma.notifiedGuestCharge.upsert({
      where: { hostawayChargeId: params.hostawayChargeId },
      create: {
        hostawayChargeId: params.hostawayChargeId,
        reservationId: reservation.id,
        amount: params.amount,
        currency: params.currency ?? 'EUR',
        inboxPosted: params.inboxPosted,
        hostawayMessageId: params.hostawayMessageId,
      },
      update: {
        inboxPosted: params.inboxPosted,
        hostawayMessageId: params.hostawayMessageId,
      },
    });

    if (!reservation.paymentBaselinedAt) {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { paymentBaselinedAt: new Date() },
      });
    }
  }

  private resolveChargeTimestamp(charge: HostawayGuestCharge): Date | undefined {
    const raw = charge.chargeDate ?? charge.scheduledDate;
    if (!raw) return undefined;
    const parsed = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private paymentMethodLabel(method?: string): string | undefined {
    if (!method) return undefined;
    return PAYMENT_METHOD_LABELS[method] ?? method.replaceAll('_', ' ');
  }
}
