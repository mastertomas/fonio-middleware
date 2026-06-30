import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from '../logging/audit-log.service';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';

@ApiTags('webhooks')
@Controller('webhooks/hostaway')
export class HostawayWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly sync: HostawaySyncService,
    private readonly audit: AuditLogService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Hostaway unified webhook receiver' })
  async handleWebhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertWebhookAuth(authorization);

    const event = String(
      body.event ?? body.object ?? body.type ?? 'unknown',
    ).toLowerCase();
    await this.audit.log({
      source: 'hostaway_webhook',
      action: event,
      metadata: { event, objectId: body.id ?? body.objectId },
    });

    if (event.includes('reservation') || event.includes('listing')) {
      await this.sync.syncFromWebhook(event, {
        event,
        objectId: body.id ?? body.objectId,
      });
    }

    return { received: true, event };
  }

  private assertWebhookAuth(authorization?: string) {
    const username = this.config.get<string>('HOSTAWAY_WEBHOOK_USERNAME');
    const password = this.config.get<string>('HOSTAWAY_WEBHOOK_PASSWORD');
    if (!username || !password) return;

    if (!authorization?.startsWith('Basic ')) {
      throw new UnauthorizedException('Webhook authentication required');
    }

    const decoded = Buffer.from(
      authorization.slice('Basic '.length),
      'base64',
    ).toString('utf8');
    const [user, pass] = decoded.split(':');
    if (user !== username || pass !== password) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
  }
}
