import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuestRequestInboxService } from '../hostaway/guest-request-inbox.service';
import { HostawayClient } from '../hostaway/hostaway.client';
import { PaymentInboxService } from '../hostaway/payment-inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentReceivedDto } from './dto/payment-received.dto';
import { FonioVerificationService } from './fonio-verification.service';

@Injectable()
export class FonioPaymentService {
  private readonly logger = new Logger(FonioPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: FonioVerificationService,
    private readonly hostaway: HostawayClient,
    private readonly inbox: GuestRequestInboxService,
    private readonly paymentInbox: PaymentInboxService,
  ) {}

  async recordPayment(dto: PaymentReceivedDto) {
    await this.verification.assertVerified(
      dto.verificationToken,
      dto.reservationId,
    );

    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: dto.reservationId },
      include: { listing: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const currency = dto.currency ?? 'EUR';
    const paymentMethod = dto.paymentMethod ?? 'bank_transfer';

    let chargeId: number | undefined;
    let hostawayError: string | undefined;

    try {
      const charge = await this.hostaway.createOfflineCharge(
        reservation.hostawayId,
        {
          title: 'Zahlung per Telefon (fonio.ai)',
          description: dto.note?.slice(0, 500) ?? 'Zahlung vom Gast telefonisch bestätigt',
          amount: dto.amount,
          paymentMethod,
          status: 'paid',
        },
      );
      chargeId = charge.id;
      this.logger.log(
        `Recorded paid offline charge ${chargeId} for reservation ${reservation.hostawayId}`,
      );
    } catch (error) {
      hostawayError =
        error instanceof Error ? error.message : 'Hostaway charge creation failed';
      this.logger.error(
        `Failed to create offline charge for reservation ${reservation.hostawayId}: ${hostawayError}`,
      );
    }

    const inboxResult = await this.inbox.notifyPaymentReceived({
      reservationHostawayId: reservation.hostawayId,
      amount: dto.amount,
      currency,
      paymentMethodLabel: paymentMethod,
      source: 'fonio',
    });

    if (chargeId) {
      await this.paymentInbox.recordNotifiedCharge({
        reservationHostawayId: reservation.hostawayId,
        hostawayChargeId: chargeId,
        amount: dto.amount,
        currency,
        inboxPosted: inboxResult.posted,
        hostawayMessageId: inboxResult.messageId,
      });
    }

    return {
      paymentRecorded: Boolean(chargeId),
      chargeId,
      hostawayError,
      inboxPosted: inboxResult.posted,
      inboxPending: inboxResult.inboxPending,
      hostawayMessageId: inboxResult.messageId,
      guestMessageDe: chargeId
        ? 'Vielen Dank — Ihre Zahlung wurde erfasst und im System hinterlegt.'
        : 'Vielen Dank — Ihre Zahlung wurde aufgenommen. Unser Team hinterlegt sie in Hostaway.',
      message: chargeId
        ? 'Payment recorded in Hostaway and noted in inbox'
        : 'Payment noted for team follow-up — Hostaway charge could not be created automatically',
    };
  }
}
