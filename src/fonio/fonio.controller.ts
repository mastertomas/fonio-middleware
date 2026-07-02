import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { FonioApiKeyGuard } from '../common/guards/fonio-api-key.guard';
import { AuditLogService } from '../logging/audit-log.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { FonioCallContextDto } from './dto/call-context.dto';
import { GuestRequestDto } from './dto/guest-request.dto';
import { GuestVerifyDto } from './dto/guest-verify.dto';
import { FonioAvailabilityService } from './fonio-availability.service';
import { FonioBookingOfferService } from './fonio-booking-offer.service';
import { FonioCallContextService } from './fonio-call-context.service';
import { FonioRequestsService } from './fonio-requests.service';
import { FonioVerificationService } from './fonio-verification.service';
import { BookingOfferDto } from './dto/booking-offer.dto';

@ApiTags('fonio')
@ApiSecurity('fonio-api-key')
@Controller('api/v1/fonio')
@UseGuards(FonioApiKeyGuard)
export class FonioController {
  constructor(
    private readonly callContextService: FonioCallContextService,
    private readonly availability: FonioAvailabilityService,
    private readonly verification: FonioVerificationService,
    private readonly requests: FonioRequestsService,
    private readonly bookingOffer: FonioBookingOfferService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('setup')
  @ApiOperation({ summary: 'fonio.ai integration URLs (copy into fonio dashboard)' })
  async getSetup() {
    return this.callContextService.getSetupDetails();
  }

  @Post('call-context')
  @ApiOperation({ summary: 'Inbound webhook – caller context for fonio prompt' })
  async callContext(@Body() dto: FonioCallContextDto) {
    const context = await this.callContextService.buildContext(dto);
    await this.audit.log({
      source: 'fonio',
      action: 'call_context',
      metadata: {
        caller_recognized: context.caller_recognized,
        has_upcoming_booking: context.has_upcoming_booking,
        hint_requires_verification: context.hint_requires_verification,
        call_id: dto.callId ?? null,
      },
    });
    return context;
  }

  @Get('availability')
  @ApiOperation({
    summary:
      'Search availability without exposing guest PII (cache-first for fast phone responses)',
  })
  async searchAvailability(@Query() query: AvailabilityQueryDto) {
    const started = Date.now();
    const data = await this.availability.search(query);
    await this.audit.log({
      source: 'fonio',
      action: 'availability_search',
      durationMs: Date.now() - started,
      metadata: {
        city: query.city,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        guests: query.guests,
        pets: query.pets ?? false,
        dataSource: data.meta.dataSource,
        responseMs: data.meta.responseMs,
        availableCount: data.availableCount,
        listingNames: (data.results ?? [])
          .slice(0, 5)
          .map((l) => l.name),
      },
    });
    return data;
  }

  @Get('guest/verify/requirements')
  @ApiOperation({
    summary: 'What the caller must provide for verification (for fonio prompt)',
  })
  async getVerifyRequirements() {
    return this.verification.getRequirements();
  }

  @Post('guest/verify')
  @ApiOperation({ summary: 'Verify guest before sharing booking details' })
  async verifyGuest(@Body() dto: GuestVerifyDto) {
    try {
      const result = await this.verification.verify(dto);
      await this.audit.log({
        source: 'fonio',
        action: 'guest_verify',
        statusCode: 200,
        metadata: {
          verified: true,
          reservationId: result.reservation.id,
          matchedFields: result.matchedFields,
          hadReservationId: Boolean(dto.reservationId),
          listingNameProvided: Boolean(dto.listingName),
          hint: result.hint ?? null,
        },
      });
      return result;
    } catch (error) {
      const raw =
        error instanceof UnauthorizedException ? error.getResponse() : null;
      const body =
        raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : { message: raw ?? 'Verification failed' };
      await this.audit.log({
        source: 'fonio',
        action: 'guest_verify',
        statusCode: 401,
        metadata: {
          verified: false,
          message: body.message ?? 'Verification failed',
          reservationId: dto.reservationId ?? body.reservationId ?? null,
          matchedFields: body.matchedFields ?? [],
          missingFields: body.missingFields ?? [],
          requiredMinMatches: body.requiredMinMatches ?? null,
          ambiguousCount: body.ambiguousCount ?? null,
          hint: body.hint ?? null,
          hadReservationId: Boolean(dto.reservationId),
          arrivalDate: dto.arrivalDate,
          departureDate: dto.departureDate,
          listingNameProvided: Boolean(dto.listingName),
        },
      });
      throw error;
    }
  }

  @Get('guest/reservation')
  @ApiOperation({ summary: 'Get safe reservation summary (verified only)' })
  async getReservation(
    @Query('reservationId') reservationId: string,
    @Query('verificationToken') verificationToken: string,
  ) {
    const result = await this.verification.getSafeReservation(
      Number(reservationId),
      verificationToken,
    );
    await this.audit.log({
      source: 'fonio',
      action: 'guest_reservation',
      metadata: {
        reservationId: Number(reservationId),
        listingName: result.listingName,
        status: result.status,
      },
    });
    return result;
  }

  @Post('guest/requests')
  @ApiOperation({ summary: 'Submit a verified guest request' })
  async submitRequest(@Body() dto: GuestRequestDto, @Req() req: { body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> }) {
    const callerPhone =
      (req.body as { callerNumber?: string }).callerNumber ??
      (req.headers['x-caller-phone'] as string | undefined);

    const result = await this.requests.handleRequest(dto, callerPhone);
    await this.audit.log({
      source: 'fonio',
      action: 'guest_request',
      metadata: {
        reservationId: dto.reservationId,
        requestType: dto.requestType,
        status: result.status,
        autoApproved: result.autoApproved,
        forwardedToTeam: result.forwardedToTeam,
        forwardedToHostaway: result.forwardedToHostaway,
        inboxPending: result.inboxPending,
        message: result.message,
        reason: result.reason,
        note: typeof dto.details?.note === 'string' ? dto.details.note.slice(0, 200) : null,
        requestedTime:
          typeof dto.details?.requestedTime === 'string'
            ? dto.details.requestedTime
            : null,
      },
    });
    return result;
  }

  @Post('booking-offer')
  @ApiOperation({
    summary:
      'Create a Hostaway booking inquiry when dates are available (no price quoted on phone)',
  })
  async createBookingOffer(@Body() dto: BookingOfferDto) {
    const started = Date.now();
    const result = await this.bookingOffer.createOffer(dto);
    await this.audit.log({
      source: 'fonio',
      action: 'booking_offer',
      durationMs: Date.now() - started,
      metadata: {
        offerCreated: result.offerCreated,
        reservationId: result.reservationId,
        listingId: result.listingId,
        listingName: result.listingName,
        checkIn: result.checkIn,
        checkOut: result.checkOut,
        guests: result.guests,
      },
    });
    return result;
  }
}
