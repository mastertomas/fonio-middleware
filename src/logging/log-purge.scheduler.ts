import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class LogPurgeScheduler {
  private readonly logger = new Logger(LogPurgeScheduler.name);

  constructor(private readonly audit: AuditLogService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredLogs() {
    await this.audit.purgeExpired();
    this.logger.log('Purged expired API audit logs');
  }
}
