import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AdminRole, ApprovalMode, Prisma, RequestType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import {
  paginated,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { maskReservationForViewer } from '../common/utils/pii.util';
import { FonioCallContextService } from '../fonio/fonio-call-context.service';
import { FonioVerificationService } from '../fonio/fonio-verification.service';
import { HostawayClient } from '../hostaway/hostaway.client';
import { HostawayConversationService } from '../hostaway/hostaway-conversation.service';
import { GuestRequestInboxService } from '../hostaway/guest-request-inbox.service';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';
import { SyncSettingsService } from '../hostaway/sync-settings.service';
import { getConditionFieldSchema } from '../rules/approval-conditions';
import { RulesService } from '../rules/rules.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  UpdateVerificationConfigDto,
} from './dto/admin-rules.dto';
import { UpdateSyncSettingsDto } from './dto/sync-settings.dto';
import { AdminAuditInterceptor } from '../logging/admin-audit.interceptor';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
    private readonly syncSettings: SyncSettingsService,
    private readonly fonioSetup: FonioCallContextService,
    private readonly hostaway: HostawayClient,
    private readonly config: ConfigService,
    private readonly rules: RulesService,
    private readonly conversations: HostawayConversationService,
    private readonly guestInbox: GuestRequestInboxService,
  ) {}

  @Get('listings')
  @ApiOperation({ summary: 'List synced listings (paginated)' })
  async listListings(@Query() query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildListingSearch(query.search);
    const [total, items] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { listingGroup: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  @Get('listing-groups')
  @ApiOperation({ summary: 'List parent/child listing groups (paginated)' })
  async listGroups(@Query() query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildGroupSearch(query.search);
    const [total, items] = await Promise.all([
      this.prisma.listingGroup.count({ where }),
      this.prisma.listingGroup.findMany({
        where,
        include: { listings: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Last sync job status and auto-sync settings' })
  async syncStatus() {
    const [last, settings, listingCount, reservationCount] = await Promise.all([
      this.prisma.syncJob.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.syncSettings.getOrCreate(),
      this.prisma.listing.count(),
      this.prisma.reservation.count(),
    ]);
    const inProgress = this.sync.isSyncInProgress();
    return { last, settings, listingCount, reservationCount, inProgress };
  }

  @Get('sync/settings')
  @ApiOperation({ summary: 'Auto-sync settings' })
  getSyncSettings() {
    return this.syncSettings.getOrCreate();
  }

  @Patch('sync/settings')
  @Roles(AdminRole.EDITOR, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update auto-sync settings' })
  updateSyncSettings(@Body() dto: UpdateSyncSettingsDto) {
    return this.syncSettings.update(dto);
  }

  @Get('sync/webhook-activity')
  @ApiOperation({ summary: 'Recent Hostaway webhook-triggered sync activity' })
  listWebhookActivity() {
    return this.prisma.syncJob.findMany({
      where: { jobType: { startsWith: 'webhook:' } },
      take: 20,
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Synced reservations (VIEWER: masked contact data)' })
  async listReservations(
    @Query() query: PaginationQueryDto,
    @Req() req: Request & { user: { role: AdminRole } },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildReservationSearch(query.search);
    const [total, items] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { arrivalDate: 'desc' },
        include: {
          listing: { include: { listingGroup: true } },
        },
      }),
    ]);
    const sanitized =
      req.user.role === AdminRole.VIEWER
        ? items.map((r) => maskReservationForViewer(r))
        : items;
    return paginated(sanitized, total, page, pageSize);
  }

  @Get('reservations/:hostawayId/conversation')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Refresh and preview Hostaway conversation for a reservation' })
  getReservationConversation(@Param('hostawayId') hostawayId: string) {
    return this.sync.refreshReservationConversation(Number(hostawayId));
  }

  @Post('reservations/:hostawayId/refresh-conversation')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Re-fetch conversation ID from Hostaway' })
  refreshConversation(@Param('hostawayId') hostawayId: string) {
    return this.sync.refreshReservationConversation(Number(hostawayId));
  }

  @Post('sync')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Trigger Hostaway full sync (runs in background)' })
  triggerSync() {
    if (this.sync.isSyncInProgress()) {
      return { started: false, message: 'Sync already running' };
    }
    void this.sync.syncAll().catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Background sync failed: ${message}`);
    });
    return { started: true, message: 'Sync started in background' };
  }

  @Get('sync/hostaway-webhooks')
  @ApiOperation({ summary: 'List unified webhooks registered in Hostaway (via Public API)' })
  listHostawayWebhooks() {
    return this.hostaway.listUnifiedWebhooks();
  }

  @Post('sync/register-webhook')
  @Roles(AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Register production webhook URL in Hostaway via Public API (no dashboard login)',
  })
  async registerHostawayWebhook(@Body() body?: { url?: string; alertingEmail?: string }) {
    const base = (
      this.config.get<string>('PRODUCTION_URL') ??
      this.config.get<string>('APP_URL') ??
      'https://vermietung.brainions.digital'
    ).replace(/\/$/, '');
    const url = body?.url ?? `${base}/webhooks/hostaway`;
    const login = this.config.get<string>('HOSTAWAY_WEBHOOK_USERNAME');
    const password = this.config.get<string>('HOSTAWAY_WEBHOOK_PASSWORD');
    const alertingEmail =
      body?.alertingEmail ??
      this.config.get<string>('ADMIN_EMAIL') ??
      undefined;

    const existing = await this.hostaway.listUnifiedWebhooks();
    const match = existing.find((w) => w.url === url);
    if (match) {
      return {
        created: false,
        message: 'Webhook URL already registered in Hostaway',
        webhook: match,
        existing,
      };
    }

    const webhook = await this.hostaway.createUnifiedWebhook({
      url,
      login: login || undefined,
      password: password || undefined,
      alertingEmailAddress: alertingEmail,
    });

    return {
      created: true,
      message: 'Webhook registered in Hostaway',
      webhook,
    };
  }

  @Get('rules/condition-fields')
  @ApiOperation({ summary: 'Condition field schema per request type (for admin UI)' })
  getRuleConditionFields() {
    return getConditionFieldSchema();
  }

  @Get('rules')
  @ApiOperation({ summary: 'List approval rules' })
  listRules() {
    return this.prisma.approvalRule.findMany({
      include: { listing: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  @Post('rules')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Create approval rule' })
  createRule(@Body() dto: CreateApprovalRuleDto) {
    const mode =
      dto.requestType === RequestType.CANCELLATION &&
      dto.mode === ApprovalMode.AUTO
        ? ApprovalMode.MANUAL
        : dto.mode;
    return this.prisma.approvalRule.create({
      data: {
        listingId: dto.listingId || null,
        requestType: dto.requestType,
        mode,
        conditions: this.rules.sanitizeRuleConditions(
          dto.requestType,
          mode,
          dto.conditions,
        ),
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch('rules/:id')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Update approval rule' })
  async updateRule(@Param('id') id: string, @Body() dto: UpdateApprovalRuleDto) {
    const existing = await this.prisma.approvalRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');

    const requestType = dto.requestType ?? existing.requestType;
    let mode = dto.mode ?? existing.mode;
    if (
      requestType === RequestType.CANCELLATION &&
      mode === ApprovalMode.AUTO
    ) {
      mode = ApprovalMode.MANUAL;
    }

    const conditionsInput =
      dto.conditions !== undefined
        ? dto.conditions
        : (existing.conditions as Record<string, unknown> | null) ?? undefined;
    const shouldUpdateConditions =
      dto.conditions !== undefined ||
      dto.mode !== undefined ||
      dto.requestType !== undefined;

    const { conditions: _c, ...rest } = dto;

    return this.prisma.approvalRule.update({
      where: { id },
      data: {
        ...rest,
        mode,
        listingId:
          dto.listingId === undefined
            ? undefined
            : dto.listingId || null,
        ...(shouldUpdateConditions
          ? {
              conditions: this.rules.sanitizeRuleConditions(
                requestType,
                mode,
                conditionsInput,
              ),
            }
          : {}),
      },
    });
  }

  @Delete('rules/:id')
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Delete approval rule' })
  async deleteRule(@Param('id') id: string) {
    await this.prisma.approvalRule.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('verification-config')
  @ApiOperation({ summary: 'Get default guest verification config (fonio)' })
  getVerificationConfig() {
    return this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });
  }

  @Get('verification-config/fields')
  @ApiOperation({ summary: 'Allowed verification field names' })
  getVerificationFieldOptions() {
    return {
      fields: FonioVerificationService.getFieldOptions(),
      descriptions: {
        reservationId: 'Hostaway reservation number (always required in API)',
        phone: 'Phone number linked to the booking',
        email: 'Email address on the booking',
        arrivalDate: 'Check-in date (YYYY-MM-DD)',
        departureDate: 'Check-out date (YYYY-MM-DD)',
        listingName: 'Booked property name (partial match)',
      },
    };
  }

  @Patch('verification-config/:id')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Update guest verification rules (not approval rules)' })
  async updateVerificationConfig(
    @Param('id') id: string,
    @Body() dto: UpdateVerificationConfigDto,
  ) {
    const fields = dto.requiredFields?.includes('reservationId')
      ? dto.requiredFields
      : ['reservationId', ...(dto.requiredFields ?? [])];
    const uniqueFields = [...new Set(fields)];
    const minMatch = Math.min(
      dto.minMatchCount ?? uniqueFields.length,
      uniqueFields.length,
    );
    return this.prisma.verificationConfig.update({
      where: { id },
      data: {
        requiredFields: uniqueFields,
        minMatchCount: minMatch,
      },
    });
  }

  @Get('guest-requests')
  @ApiOperation({ summary: 'List recent guest requests' })
  listGuestRequests() {
    return this.prisma.guestRequest.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        reservation: {
          include: {
            listing: true,
          },
        },
      },
    });
  }

  @Post('guest-requests/:id/retry-forward')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({ summary: 'Retry sending a guest request to Hostaway inbox' })
  retryGuestRequestForward(@Param('id') id: string) {
    return this.guestInbox.retryForward(id);
  }

  @Post('sync/conversations-backfill')
  @Roles(AdminRole.EDITOR)
  @ApiOperation({
    summary: 'Link Hostaway conversations to reservations and retry pending inbox forwards',
  })
  async backfillConversations() {
    const linked = await this.conversations.backfillMissing();
    const retries = await this.guestInbox.retryPendingForwards();
    return { ...linked, inboxRetries: retries };
  }

  @Get('logs')
  @ApiOperation({ summary: 'Recent API audit logs (non-PII metadata)' })
  listLogs() {
    return this.prisma.apiLog.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('fonio-setup')
  @ApiOperation({ summary: 'fonio integration URLs for dashboard (production only)' })
  getFonioSetup() {
    const urls = this.fonioSetup.getSetupUrls();
    return {
      production: urls.production,
      fonioApiKeyConfigured: urls.fonioApiKeyConfigured,
      notes: urls.notes,
    };
  }

  private buildListingSearch(search?: string): Prisma.ListingWhereInput {
    const term = search?.trim();
    if (!term) return {};
    const id = Number(term);
    return {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
        { region: { contains: term, mode: 'insensitive' } },
        { listingGroup: { name: { contains: term, mode: 'insensitive' } } },
        ...(Number.isFinite(id) ? [{ hostawayId: id }] : []),
      ],
    };
  }

  private buildGroupSearch(search?: string): Prisma.ListingGroupWhereInput {
    const term = search?.trim();
    if (!term) return {};
    const id = Number(term);
    return {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
        ...(Number.isFinite(id) ? [{ hostawayParentId: id }] : []),
      ],
    };
  }

  private buildReservationSearch(search?: string): Prisma.ReservationWhereInput {
    const term = search?.trim();
    if (!term) return {};
    const id = Number(term);
    return {
      OR: [
        { guestName: { contains: term, mode: 'insensitive' } },
        { guestEmail: { contains: term, mode: 'insensitive' } },
        { guestPhone: { contains: term, mode: 'insensitive' } },
        { listing: { name: { contains: term, mode: 'insensitive' } } },
        { listing: { listingGroup: { name: { contains: term, mode: 'insensitive' } } } },
        ...(Number.isFinite(id)
          ? [{ hostawayId: id }, { hostawayConversationId: id }]
          : []),
      ],
    };
  }
}
