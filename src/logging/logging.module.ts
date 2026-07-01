import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLogService } from './audit-log.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { LogPurgeScheduler } from './log-purge.scheduler';

@Global()
@Module({
  imports: [ScheduleModule],
  providers: [AuditLogService, AdminAuditInterceptor, LogPurgeScheduler],
  exports: [AuditLogService, AdminAuditInterceptor],
})
export class LoggingModule {}
