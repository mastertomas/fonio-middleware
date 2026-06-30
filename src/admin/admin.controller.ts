import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  paginated,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FonioCallContextService } from '../fonio/fonio-call-context.service';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';
import { SyncSettingsService } from '../hostaway/sync-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  UpdateVerificationConfigDto,
} from './dto/admin-rules.dto';
import { UpdateSyncSettingsDto } from './dto/sync-settings.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
    private readonly syncSettings: SyncSettingsService,
    private readonly fonioSetup: FonioCallContextService,
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
  @ApiOperation({ summary: 'Synced reservations (paginated, admin contact data)' })
  async listReservations(@Query() query: PaginationQueryDto) {
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
    return paginated(items, total, page, pageSize);
  }

  @Get('reservations/:hostawayId/conversation')
  @ApiOperation({ summary: 'Refresh and preview Hostaway conversation for a reservation' })
  getReservationConversation(@Param('hostawayId') hostawayId: string) {
    return this.sync.refreshReservationConversation(Number(hostawayId));
  }

  @Post('reservations/:hostawayId/refresh-conversation')
  @ApiOperation({ summary: 'Re-fetch conversation ID from Hostaway' })
  refreshConversation(@Param('hostawayId') hostawayId: string) {
    return this.sync.refreshReservationConversation(Number(hostawayId));
  }

  @Post('sync')
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

  @Get('rules')
  @ApiOperation({ summary: 'List approval rules' })
  listRules() {
    return this.prisma.approvalRule.findMany({
      include: { listing: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create approval rule' })
  createRule(@Body() dto: CreateApprovalRuleDto) {
    return this.prisma.approvalRule.create({
      data: {
        listingId: dto.listingId || null,
        requestType: dto.requestType,
        mode: dto.mode,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update approval rule' })
  updateRule(@Param('id') id: string, @Body() dto: UpdateApprovalRuleDto) {
    return this.prisma.approvalRule.update({
      where: { id },
      data: {
        ...dto,
        listingId:
          dto.listingId === undefined
            ? undefined
            : dto.listingId || null,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
      },
    });
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete approval rule' })
  async deleteRule(@Param('id') id: string) {
    await this.prisma.approvalRule.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('verification-config')
  @ApiOperation({ summary: 'Get default verification config' })
  getVerificationConfig() {
    return this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });
  }

  @Patch('verification-config/:id')
  @ApiOperation({ summary: 'Update verification config' })
  updateVerificationConfig(
    @Param('id') id: string,
    @Body() dto: UpdateVerificationConfigDto,
  ) {
    return this.prisma.verificationConfig.update({
      where: { id },
      data: dto,
    });
  }

  @Get('guest-requests')
  @ApiOperation({ summary: 'List recent guest requests' })
  listGuestRequests() {
    return this.prisma.guestRequest.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { reservation: { include: { listing: true } } },
    });
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
  @ApiOperation({ summary: 'fonio.ai integration URLs for dashboard' })
  getFonioSetup() {
    return this.fonioSetup.getSetupUrls();
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
