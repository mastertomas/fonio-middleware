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
import { GuestRequestInboxService } from '../hostaway/guest-request-inbox.service';
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
    private readonly inbox: GuestRequestInboxService,
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
      requestDetails: dto.details,
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

    let forwardResult: Awaited<
      ReturnType<GuestRequestInboxService['forwardGuestRequest']>
    > | null = null;

    if (status === RequestStatus.FORWARDED) {
      forwardResult = await this.inbox.forwardGuestRequest({
        guestRequestId: guestRequest.id,
        reservationHostawayId: reservation.hostawayId,
        requestType: dto.requestType,
        listingName: reservation.listing.name,
        summaryLines: this.buildSummaryLines(dto, reservation.listing.name),
        ruleReason: evaluation.reason,
        callerNote: dto.details?.note as string | undefined,
      });
    }

    const forwardedToHostaway = forwardResult?.forwarded ?? false;
    const inboxPending = forwardResult?.inboxPending ?? false;

    return {
      requestId: guestRequest.id,
      status,
      autoApproved: status === RequestStatus.AUTO_APPROVED,
      forwardedToTeam: status === RequestStatus.FORWARDED,
      forwardedToHostaway,
      inboxPending,
      hostawayMessageId: forwardResult?.messageId,
      message: this.buildGuestMessage(status, forwardedToHostaway, inboxPending),
      reason: evaluation.reason,
    };
  }

  private buildGuestMessage(
    status: RequestStatus,
    forwardedToHostaway: boolean,
    inboxPending: boolean,
  ): string {
    if (status === RequestStatus.AUTO_APPROVED) {
      return 'Request approved automatically';
    }
    if (status === RequestStatus.REJECTED) {
      return 'Request cannot be approved automatically';
    }
    if (forwardedToHostaway) {
      return 'Request forwarded to your team in Hostaway inbox';
    }
    if (inboxPending) {
      return 'Request recorded — team will be notified in Hostaway when the conversation is available';
    }
    return 'Request forwarded to your team';
  }

  private buildSummaryLines(
    dto: GuestRequestDto,
    listingName: string,
  ): string[] {
    const lines = [
      `Unterkunft: ${listingName}`,
      `Reservierung: ${dto.reservationId}`,
    ];
    if (dto.details) {
      for (const [key, value] of Object.entries(dto.details)) {
        lines.push(`${key}: ${String(value)}`);
      }
    }
    return lines;
  }
}
