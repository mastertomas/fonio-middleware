import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type LogRetentionRule = 'debug' | 'pii' | 'operational' | 'max_cap';

export interface ResolvedLogRetention {
  debugRetentionDays: number;
  operationalRetentionDays: number;
  piiRetentionDays: number;
  maxRetentionDays: number;
  debugAutoDelete: boolean;
  operationalAutoDelete: boolean;
  piiAutoDelete: boolean;
  autoPurgeEnabled: boolean;
}

@Injectable()
export class LogSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getOrCreate() {
    const existing = await this.prisma.logSettings.findUnique({
      where: { id: 'default' },
    });
    if (existing) return existing;

    return this.prisma.logSettings.create({
      data: {
        id: 'default',
        debugRetentionDays: this.clamp(
          Number(this.config.get('LOG_RETENTION_DEBUG_DAYS') ?? 14),
          7,
          14,
        ),
        operationalRetentionDays: this.clamp(
          Number(this.config.get('LOG_RETENTION_OPERATIONAL_DAYS') ?? 30),
          1,
          90,
        ),
        piiRetentionDays: this.clamp(
          Number(this.config.get('LOG_RETENTION_PII_DAYS') ?? 30),
          1,
          30,
        ),
        maxRetentionDays: this.clamp(
          Number(this.config.get('LOG_RETENTION_MAX_DAYS') ?? 90),
          30,
          90,
        ),
        debugAutoDelete: true,
        operationalAutoDelete: true,
        piiAutoDelete: true,
        autoPurgeEnabled: true,
      },
    });
  }

  async getResolved(): Promise<ResolvedLogRetention> {
    const settings = await this.getOrCreate();
    const maxRetentionDays = this.clamp(settings.maxRetentionDays, 30, 90);
    return {
      debugRetentionDays: this.clamp(settings.debugRetentionDays, 7, 14),
      operationalRetentionDays: Math.min(
        this.clamp(settings.operationalRetentionDays, 1, 90),
        maxRetentionDays,
      ),
      piiRetentionDays: Math.min(
        this.clamp(settings.piiRetentionDays, 1, 30),
        maxRetentionDays,
      ),
      maxRetentionDays,
      debugAutoDelete: settings.debugAutoDelete,
      operationalAutoDelete: settings.operationalAutoDelete,
      piiAutoDelete: settings.piiAutoDelete,
      autoPurgeEnabled: settings.autoPurgeEnabled,
    };
  }

  async update(data: {
    debugRetentionDays?: number;
    operationalRetentionDays?: number;
    piiRetentionDays?: number;
    maxRetentionDays?: number;
    debugAutoDelete?: boolean;
    operationalAutoDelete?: boolean;
    piiAutoDelete?: boolean;
    autoPurgeEnabled?: boolean;
  }) {
    await this.getOrCreate();
    const current = await this.getResolved();
    const maxRetentionDays = this.clamp(
      data.maxRetentionDays ?? current.maxRetentionDays,
      30,
      90,
    );
    const debugRetentionDays = this.clamp(
      data.debugRetentionDays ?? current.debugRetentionDays,
      7,
      14,
    );
    const operationalRetentionDays = Math.min(
      this.clamp(
        data.operationalRetentionDays ?? current.operationalRetentionDays,
        1,
        90,
      ),
      maxRetentionDays,
    );
    const piiRetentionDays = Math.min(
      this.clamp(data.piiRetentionDays ?? current.piiRetentionDays, 1, 30),
      maxRetentionDays,
    );

    return this.prisma.logSettings.update({
      where: { id: 'default' },
      data: {
        debugRetentionDays,
        operationalRetentionDays,
        piiRetentionDays,
        maxRetentionDays,
        debugAutoDelete: data.debugAutoDelete ?? current.debugAutoDelete,
        operationalAutoDelete:
          data.operationalAutoDelete ?? current.operationalAutoDelete,
        piiAutoDelete: data.piiAutoDelete ?? current.piiAutoDelete,
        autoPurgeEnabled: data.autoPurgeEnabled ?? current.autoPurgeEnabled,
      },
    });
  }

  async retentionDaysFor(
    level: LogLevel,
    hasPii: boolean,
  ): Promise<number> {
    const settings = await this.getResolved();
    if (level === LogLevel.DEBUG) {
      return settings.debugAutoDelete
        ? settings.debugRetentionDays
        : settings.maxRetentionDays;
    }
    if (hasPii) {
      return settings.piiAutoDelete
        ? settings.piiRetentionDays
        : settings.maxRetentionDays;
    }
    return settings.operationalAutoDelete
      ? settings.operationalRetentionDays
      : settings.maxRetentionDays;
  }

  async getStatus(
    containsPii: (metadata: Record<string, unknown>) => boolean,
  ) {
    const settings = await this.getResolved();
    const now = new Date();
    const [total, expired] = await Promise.all([
      this.prisma.apiLog.count(),
      this.prisma.apiLog.count({
        where: { expiresAt: { lt: now } },
      }),
    ]);
    const recent = await this.prisma.apiLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        source: true,
        action: true,
        level: true,
        metadata: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const samples = recent.map((log) => {
      const meta =
        log.metadata &&
        typeof log.metadata === 'object' &&
        !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {};
      let rule: LogRetentionRule = 'operational';
      if (log.level === LogLevel.DEBUG && settings.debugAutoDelete) {
        rule = 'debug';
      } else if (containsPii(meta) && settings.piiAutoDelete) {
        rule = 'pii';
      } else if (!settings.operationalAutoDelete) {
        rule = 'max_cap';
      }
      return {
        source: log.source,
        action: log.action,
        createdAt: log.createdAt,
        expiresAt: log.expiresAt,
        retentionRule: rule,
      };
    });

    return {
      settings,
      totalLogs: total,
      expiredLogs: expired,
      permanentDeletion: true,
      nextPurgeAt: this.nextPurgeAt(),
      samples,
    };
  }

  isAutoPurgeEnabled(): Promise<boolean> {
    return this.getResolved().then((s) => s.autoPurgeEnabled);
  }

  private nextPurgeAt(): string {
    const next = new Date();
    next.setHours(3, 0, 0, 0);
    if (next.getTime() <= Date.now()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
  }
}
