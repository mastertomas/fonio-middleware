import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel, Prisma } from '@prisma/client';
import { hashValue } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async log(params: {
    level?: LogLevel;
    source: string;
    action: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
    ip?: string;
  }) {
    const level = params.level ?? LogLevel.INFO;
    const debugDays = Number(this.config.get('LOG_RETENTION_DEBUG_DAYS') ?? 14);
    const maxDays = Number(this.config.get('LOG_RETENTION_MAX_DAYS') ?? 90);
    const opDays = Math.min(
      Number(this.config.get('LOG_RETENTION_OPERATIONAL_DAYS') ?? 30),
      maxDays,
    );
    const piiDays = Math.min(
      Number(this.config.get('LOG_RETENTION_PII_DAYS') ?? 30),
      maxDays,
    );

    const retentionDays =
      level === LogLevel.DEBUG
        ? debugDays
        : level === LogLevel.SECURITY || level === LogLevel.ERROR
          ? opDays
          : params.metadata && this.containsPii(params.metadata)
            ? piiDays
            : opDays;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    await this.prisma.apiLog.create({
      data: {
        level,
        source: params.source,
        action: params.action,
        method: params.method,
        path: params.path,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        metadata: (params.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        ipHash: params.ip ? hashValue(params.ip) : undefined,
        expiresAt,
      },
    });
  }

  private containsPii(metadata: Record<string, unknown>): boolean {
    const keys = Object.keys(metadata).join(' ').toLowerCase();
    return ['email', 'phone', 'token', 'password', 'guest'].some((k) =>
      keys.includes(k),
    );
  }

  async purgeExpired() {
    await this.prisma.apiLog.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
