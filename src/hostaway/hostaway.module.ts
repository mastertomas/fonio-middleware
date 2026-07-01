import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HostawayClient } from './hostaway.client';
import { HostawayConversationService } from './hostaway-conversation.service';
import { GuestRequestInboxService } from './guest-request-inbox.service';
import { HostawayMessagingService } from './hostaway-messaging.service';
import { HostawaySyncScheduler } from './hostaway-sync.scheduler';
import { HostawaySyncService } from './hostaway-sync.service';
import { ListingHierarchyService } from './listing-hierarchy.service';
import { SyncSettingsService } from './sync-settings.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    HostawayClient,
    HostawaySyncService,
    HostawayConversationService,
    GuestRequestInboxService,
    HostawayMessagingService,
    HostawaySyncScheduler,
    SyncSettingsService,
    ListingHierarchyService,
  ],
  exports: [
    HostawayClient,
    HostawaySyncService,
    HostawayConversationService,
    GuestRequestInboxService,
    HostawayMessagingService,
    SyncSettingsService,
    ListingHierarchyService,
  ],
})
export class HostawayModule {}
