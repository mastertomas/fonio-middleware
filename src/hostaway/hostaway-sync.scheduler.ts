import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HostawaySyncService } from './hostaway-sync.service';
import { SyncSettingsService } from './sync-settings.service';

@Injectable()
export class HostawaySyncScheduler {
  private readonly logger = new Logger(HostawaySyncScheduler.name);
  private running = false;

  constructor(
    private readonly sync: HostawaySyncService,
    private readonly syncSettings: SyncSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledSync() {
    const shouldRun = await this.syncSettings.shouldRunAutoSync();
    if (!shouldRun) return;
    if (this.running || this.sync.isSyncInProgress()) {
      this.logger.warn('Sync already in progress, skipping');
      return;
    }

    this.running = true;
    try {
      const result = await this.sync.syncAll('auto_sync');
      await this.syncSettings.markAutoSyncCompleted();
      this.logger.log(
        `Scheduled sync completed: ${result.listings} listings, ${result.reservations} reservations`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Scheduled sync failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
