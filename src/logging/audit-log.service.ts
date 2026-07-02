import { Injectable } from '@nestjs/common';
import { LogLevel, Prisma } from '@prisma/client';
import { hashValue } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { LogSettingsService } from './log-settings.service';

const PII_KEY_HINTS = [
  'email',
  'phone',
  'token',
  'password',
  'guest',
  'caller',
];

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logSettings: LogSettingsService,
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
    const hasPii = params.metadata
      ? this.containsPii(params.metadata)
      : false;
    const retentionDays = await this.logSettings.retentionDaysFor(
      level,
      hasPii,
    );

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

  containsPii(metadata: Record<string, unknown>): boolean {
    return this.scanForPii(metadata, 0);
  }

  private scanForPii(value: unknown, depth: number): boolean {
    if (depth > 5) return false;
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) {
      return value.some((item) => this.scanForPii(item, depth + 1));
    }
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const lower = key.toLowerCase();
        if (PII_KEY_HINTS.some((hint) => lower.includes(hint))) {
          return true;
        }
        if (this.scanForPii(nested, depth + 1)) return true;
      }
      return false;
    }
    return false;
  }

  async purgeExpired() {
    const result = await this.prisma.apiLog.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
