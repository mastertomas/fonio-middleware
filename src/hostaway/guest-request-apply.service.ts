import { Injectable, Logger } from '@nestjs/common';
import { RequestType } from '@prisma/client';
import { HostawayClient } from './hostaway.client';
import { HostawaySyncService } from './hostaway-sync.service';

export interface ApplyGuestRequestParams {
  reservationHostawayId: number;
  requestType: RequestType;
  currentGuests: number;
  currentPets: number | null;
  additionalGuests?: number;
}

export interface ApplyGuestRequestResult {
  applied: boolean;
  error?: string;
  hostawayPayload?: Record<string, unknown>;
}

@Injectable()
export class GuestRequestApplyService {
  private readonly logger = new Logger(GuestRequestApplyService.name);

  constructor(
    private readonly hostaway: HostawayClient,
    private readonly sync: HostawaySyncService,
  ) {}

  async applyToHostaway(
    params: ApplyGuestRequestParams,
  ): Promise<ApplyGuestRequestResult> {
    const payload = this.buildHostawayUpdate(params);
    if (!payload) {
      return {
        applied: false,
        error: `Request type ${params.requestType} cannot be auto-applied to Hostaway`,
      };
    }

    let livePayload: Record<string, unknown> | undefined;
    try {
      const remote = await this.hostaway.getReservation(params.reservationHostawayId);
      livePayload =
        this.buildHostawayUpdate({
          ...params,
          currentGuests: remote.numberOfGuests,
          currentPets: remote.pets,
        }) ?? undefined;
      if (!livePayload) {
        return {
          applied: false,
          error: `Request type ${params.requestType} cannot be auto-applied to Hostaway`,
        };
      }

      await this.hostaway.updateReservation(
        params.reservationHostawayId,
        livePayload,
      );
      await this.sync.syncSingleReservation(params.reservationHostawayId);
      this.logger.log(
        `Applied ${params.requestType} to Hostaway reservation ${params.reservationHostawayId}: ${JSON.stringify(livePayload)}`,
      );
      return { applied: true, hostawayPayload: livePayload };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Hostaway update failed';
      this.logger.error(
        `Failed to apply ${params.requestType} to reservation ${params.reservationHostawayId}: ${message}`,
      );
      return { applied: false, error: message, hostawayPayload: livePayload };
    }
  }

  private buildHostawayUpdate(
    params: ApplyGuestRequestParams,
  ): Record<string, unknown> | null {
    switch (params.requestType) {
      case RequestType.ADD_GUEST: {
        const delta = Math.max(1, params.additionalGuests ?? 1);
        const numberOfGuests = params.currentGuests + delta;
        return { numberOfGuests, adults: numberOfGuests };
      }
      case RequestType.ADD_PET: {
        const pets = (params.currentPets ?? 0) + 1;
        return { pets };
      }
      default:
        return null;
    }
  }
}
