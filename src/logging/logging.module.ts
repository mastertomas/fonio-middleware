import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLogService } from './audit-log.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { LogPurgeScheduler } from './log-purge.scheduler';
import { LogSettingsService } from './log-settings.service';

@Global()
@Module({
  imports: [ScheduleModule],
  providers: [
    LogSettingsService,
    AuditLogService,
    AdminAuditInterceptor,
    LogPurgeScheduler,
  ],
  exports: [AuditLogService, AdminAuditInterceptor, LogSettingsService],
})
export class LoggingModule {}
