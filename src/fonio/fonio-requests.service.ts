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
import { GuestRequestApplyService } from '../hostaway/guest-request-apply.service';
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
    private readonly apply: GuestRequestApplyService,
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

    let forwardResult: {
      forwarded?: boolean;
      posted?: boolean;
      messageId?: number;
      inboxPending: boolean;
    } | null = null;
    let hostawayApplied = false;
    let hostawayApplyError: string | undefined;

    if (status === RequestStatus.AUTO_APPROVED) {
      const applyResult = await this.apply.applyToHostaway({
        reservationHostawayId: reservation.hostawayId,
        requestType: dto.requestType,
        currentGuests: reservation.numberOfGuests,
        currentPets: reservation.pets,
        additionalGuests: dto.additionalGuests,
      });
      hostawayApplied = applyResult.applied;
      hostawayApplyError = applyResult.error;

      await this.prisma.guestRequest.update({
        where: { id: guestRequest.id },
        data: {
          payload: {
            details: dto.details ?? {},
            ruleReason: evaluation.reason,
            ruleId: evaluation.ruleId,
            hostawayApplied,
            hostawayApplyError,
            hostawayPayload: applyResult.hostawayPayload,
          } as Prisma.InputJsonValue,
        },
      });

      if (!hostawayApplied) {
        forwardResult = await this.inbox.forwardGuestRequest({
          guestRequestId: guestRequest.id,
          reservationHostawayId: reservation.hostawayId,
          requestType: dto.requestType,
          listingName: reservation.listing.name,
          summaryLines: this.buildSummaryLines(dto, reservation.listing.name),
          ruleReason: evaluation.reason,
          callerNote: dto.details?.note as string | undefined,
        });
      } else {
        forwardResult = await this.inbox.notifyAppliedChange({
          guestRequestId: guestRequest.id,
          reservationHostawayId: reservation.hostawayId,
          requestType: dto.requestType,
          additionalGuests: dto.additionalGuests,
        });
      }
    } else if (status === RequestStatus.FORWARDED) {
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

    const forwardedToHostaway = forwardResult?.forwarded ?? forwardResult?.posted ?? false;
    const inboxPending = forwardResult?.inboxPending ?? false;

    return {
      requestId: guestRequest.id,
      status,
      autoApproved: status === RequestStatus.AUTO_APPROVED,
      hostawayApplied,
      hostawayApplyError,
      forwardedToTeam:
        status === RequestStatus.FORWARDED ||
        (status === RequestStatus.AUTO_APPROVED && !hostawayApplied),
      forwardedToHostaway,
      inboxPending,
      hostawayMessageId: forwardResult?.messageId,
      message: this.buildGuestMessage(
        status,
        hostawayApplied,
        forwardedToHostaway,
        inboxPending,
      ),
      guestMessageDe: this.buildGuestMessageDe(
        dto.requestType,
        status,
        hostawayApplied,
        forwardedToHostaway,
        inboxPending,
      ),
      reason: evaluation.reason,
    };
  }

  private buildGuestMessageDe(
    requestType: RequestType,
    status: RequestStatus,
    hostawayApplied: boolean,
    forwardedToHostaway: boolean,
    inboxPending: boolean,
  ): string {
    const topic = this.requestTypeLabelDe(requestType);
    if (status === RequestStatus.AUTO_APPROVED && hostawayApplied) {
      return `Ihre Anfrage (${topic}) wurde bestätigt und in Ihrer Buchung übernommen.`;
    }
    if (status === RequestStatus.AUTO_APPROVED) {
      return `Ihre Anfrage (${topic}) wurde aufgenommen. Unser Team übernimmt die Buchungsänderung in Hostaway.`;
    }
    if (status === RequestStatus.REJECTED) {
      return `Ihre Anfrage (${topic}) kann so leider nicht automatisch bestätigt werden. Unser Team meldet sich bei Ihnen.`;
    }
    if (forwardedToHostaway) {
      return `Ihre Anfrage (${topic}) wurde an unser Team weitergeleitet. Sie erhalten eine Rückmeldung in der Buchung.`;
    }
    if (inboxPending) {
      return `Ihre Anfrage (${topic}) wurde aufgenommen. Unser Team wird sich bei Ihnen melden.`;
    }
    return `Ihre Anfrage (${topic}) wurde an unser Team weitergeleitet.`;
  }

  private requestTypeLabelDe(requestType: RequestType): string {
    switch (requestType) {
      case RequestType.ADD_PET:
        return 'Haustier';
      case RequestType.ADD_GUEST:
        return 'zusätzlicher Gast';
      case RequestType.CANCELLATION:
        return 'Stornierung';
      case RequestType.EARLY_CHECKIN:
        return 'früher Check-in';
      case RequestType.LATE_CHECKOUT:
        return 'später Check-out';
      default:
        return 'Änderung';
    }
  }

  private buildGuestMessage(
    status: RequestStatus,
    hostawayApplied: boolean,
    forwardedToHostaway: boolean,
    inboxPending: boolean,
  ): string {
    if (status === RequestStatus.AUTO_APPROVED && hostawayApplied) {
      return 'Request approved and applied to Hostaway reservation';
    }
    if (status === RequestStatus.AUTO_APPROVED) {
      return 'Request approved locally; Hostaway update pending team follow-up';
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
