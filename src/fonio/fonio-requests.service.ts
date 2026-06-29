import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalMode,
  Prisma,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { hashValue } from '../common/utils/crypto.util';
import { HostawayMessagingService } from '../hostaway/hostaway-messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { GuestRequestDto } from './dto/guest-request.dto';
import { FonioVerificationService } from './fonio-verification.service';

@Injectable()
export class FonioRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: FonioVerificationService,
    private readonly rules: RulesService,
    private readonly messaging: HostawayMessagingService,
  ) {}

  async handleRequest(dto: GuestRequestDto, callerPhone?: string) {
    await this.verification.assertVerified(
      dto.verificationToken ?? '',
      dto.reservationId,
    );

    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: dto.reservationId },
      include: { listing: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const evaluation = await this.rules.evaluate({
      listingId: reservation.listingId,
      requestType: dto.requestType,
      currentGuests: reservation.numberOfGuests,
      requestedGuests:
        dto.additionalGuests ??
        reservation.numberOfGuests +
          Number(dto.details?.additionalGuests ?? 0),
      petsRequested: dto.requestType === RequestType.ADD_PET,
      listingCapacity: reservation.listing.personCapacity,
      listingAllowsPets: reservation.listing.petsAllowed,
    });

    const status =
      evaluation.mode === ApprovalMode.AUTO
        ? RequestStatus.AUTO_APPROVED
        : evaluation.mode === ApprovalMode.DENY
          ? RequestStatus.REJECTED
          : RequestStatus.FORWARDED;

    const guestRequest = await this.prisma.guestRequest.create({
      data: {
        reservationId: reservation.id,
        requestType: dto.requestType,
        status,
        payload: {
          details: dto.details ?? {},
          ruleReason: evaluation.reason,
          ruleId: evaluation.ruleId,
        } as Prisma.InputJsonValue,
        fonioCallId: dto.callId,
        callerPhoneHash: callerPhone ? hashValue(callerPhone) : undefined,
      },
    });

    let hostawayMessageId: number | undefined;

    if (
      status === RequestStatus.FORWARDED &&
      reservation.hostawayConversationId
    ) {
      hostawayMessageId = await this.messaging.forwardRequestToInbox({
        conversationId: reservation.hostawayConversationId,
        guestRequestId: guestRequest.id,
        requestType: dto.requestType,
        summary: this.buildSummary(dto, reservation.listing.name),
        callerNote: dto.details?.note as string | undefined,
      });

      await this.prisma.guestRequest.update({
        where: { id: guestRequest.id },
        data: {
          forwardedToHostaway: true,
          hostawayMessageId,
        },
      });
    }

    return {
      requestId: guestRequest.id,
      status,
      autoApproved: status === RequestStatus.AUTO_APPROVED,
      forwardedToTeam: status === RequestStatus.FORWARDED,
      message:
        status === RequestStatus.AUTO_APPROVED
          ? 'Request approved automatically'
          : status === RequestStatus.REJECTED
            ? 'Request cannot be approved automatically'
            : 'Request forwarded to your team in Hostaway',
      reason: evaluation.reason,
    };
  }

  private buildSummary(dto: GuestRequestDto, listingName: string): string {
    const lines = [`Unterkunft: ${listingName}`, `Reservierung: ${dto.reservationId}`];
    if (dto.details) {
      for (const [key, value] of Object.entries(dto.details)) {
        lines.push(`${key}: ${String(value)}`);
      }
    }
    return lines.join('\n');
  }
}
