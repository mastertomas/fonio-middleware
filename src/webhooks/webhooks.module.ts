import { Module } from '@nestjs/common';
import { HostawayModule } from '../hostaway/hostaway.module';
import { HostawayWebhookController } from './hostaway-webhook.controller';

@Module({
  imports: [HostawayModule],
  controllers: [HostawayWebhookController],
})
export class WebhooksModule {}
