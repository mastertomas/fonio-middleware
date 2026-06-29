import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HostawaySyncService } from './hostaway-sync.service';

@Injectable()
export class HostawaySyncScheduler {
  private readonly logger = new Logger(HostawaySyncScheduler.name);
  private running = false;

  constructor(
    private readonly sync: HostawaySyncService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledSync() {
    if (this.config.get('SYNC_ENABLED') === 'false') return;
    if (this.running) {
      this.logger.warn('Sync already in progress, skipping');
      return;
    }

    this.running = true;
    try {
      const result = await this.sync.syncAll();
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
