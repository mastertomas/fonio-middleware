import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
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
import { ConfigService } from '@nestjs/config';
import { FonioCallContextService } from './fonio-call-context.service';
import { FonioRequestsService } from './fonio-requests.service';
import { FonioVerificationService } from './fonio-verification.service';

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
    private readonly audit: AuditLogService,
  ) {}

  @Get('setup')
  @ApiOperation({ summary: 'fonio.ai integration URLs (copy into fonio dashboard)' })
  getSetup() {
    return this.callContextService.getSetupUrls();
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
      },
    });
    return context;
  }

  @Get('availability')
  @ApiOperation({ summary: 'Search availability without exposing guest PII' })
  async searchAvailability(@Query() query: AvailabilityQueryDto) {
    const results = await this.availability.search(query);
    await this.audit.log({
      source: 'fonio',
      action: 'availability_search',
      metadata: {
        city: query.city,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        guests: query.guests,
        resultCount: results.filter((r) => r.available).length,
      },
    });
    return {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests,
      results,
      availableCount: results.filter((r) => r.available).length,
    };
  }

  @Post('guest/verify')
  @ApiOperation({ summary: 'Verify guest before sharing booking details' })
  async verifyGuest(@Body() dto: GuestVerifyDto) {
    const result = await this.verification.verify(dto);
    await this.audit.log({
      source: 'fonio',
      action: 'guest_verify',
      metadata: { reservationId: dto.reservationId, verified: result.verified },
    });
    return result;
  }

  @Get('guest/reservation')
  @ApiOperation({ summary: 'Get safe reservation summary (verified only)' })
  async getReservation(
    @Query('reservationId') reservationId: string,
    @Query('verificationToken') verificationToken: string,
  ) {
    return this.verification.getSafeReservation(
      Number(reservationId),
      verificationToken,
    );
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
      },
    });
    return result;
  }
}
