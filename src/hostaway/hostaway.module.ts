import { Module } from '@nestjs/common';
import { HostawayClient } from './hostaway.client';
import { HostawayMessagingService } from './hostaway-messaging.service';
import { HostawaySyncService } from './hostaway-sync.service';

@Module({
  providers: [HostawayClient, HostawaySyncService, HostawayMessagingService],
  exports: [HostawayClient, HostawaySyncService, HostawayMessagingService],
})
export class HostawayModule {}
