import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HostawayClient } from './hostaway.client';
import { HostawayMessagingService } from './hostaway-messaging.service';
import { HostawaySyncScheduler } from './hostaway-sync.scheduler';
import { HostawaySyncService } from './hostaway-sync.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    HostawayClient,
    HostawaySyncService,
    HostawayMessagingService,
    HostawaySyncScheduler,
  ],
  exports: [HostawayClient, HostawaySyncService, HostawayMessagingService],
})
export class HostawayModule {}
