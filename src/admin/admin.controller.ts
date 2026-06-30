import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FonioCallContextService } from '../fonio/fonio-call-context.service';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateApprovalRuleDto,
  UpdateVerificationConfigDto,
} from './dto/admin-rules.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HostawaySyncService,
    private readonly fonioSetup: FonioCallContextService,
  ) {}

  @Get('listings')
  @ApiOperation({ summary: 'List synced listings' })
  listListings() {
    return this.prisma.listing.findMany({
      orderBy: { name: 'asc' },
      include: { listingGroup: true },
    });
  }

  @Get('listing-groups')
  @ApiOperation({ summary: 'List parent/child listing groups' })
  listGroups() {
    return this.prisma.listingGroup.findMany({
      include: { listings: true },
    });
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Last sync job status' })
  async syncStatus() {
    const last = await this.prisma.syncJob.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    const listingCount = await this.prisma.listing.count();
    const reservationCount = await this.prisma.reservation.count();
    return { last, listingCount, reservationCount };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger Hostaway full sync' })
  triggerSync() {
    return this.sync.syncAll();
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
  @ApiOperation({ summary: 'Create or update approval rule (one per request type + listing)' })
  async upsertRule(@Body() dto: CreateApprovalRuleDto) {
    const listingId = dto.listingId ?? null;
    const existing = await this.prisma.approvalRule.findFirst({
      where: {
        requestType: dto.requestType,
        listingId,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const data = {
      mode: dto.mode,
      conditions: dto.conditions as Prisma.InputJsonValue | undefined,
      priority: dto.priority ?? 0,
      isActive: dto.isActive ?? true,
    };

    if (existing) {
      if (!listingId) {
        await this.prisma.approvalRule.deleteMany({
          where: {
            requestType: dto.requestType,
            listingId: null,
            id: { not: existing.id },
          },
        });
      }
      return this.prisma.approvalRule.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.approvalRule.create({
      data: {
        listingId: dto.listingId,
        requestType: dto.requestType,
        ...data,
      },
    });
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
}
