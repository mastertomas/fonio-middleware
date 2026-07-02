import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedLogRetention {
  debugRetentionDays: number;
  operationalRetentionDays: number;
  piiRetentionDays: number;
  maxRetentionDays: number;
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
    };
  }

  async update(data: {
    debugRetentionDays?: number;
    operationalRetentionDays?: number;
    piiRetentionDays?: number;
    maxRetentionDays?: number;
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
      },
    });
  }

  async retentionDaysFor(
    level: LogLevel,
    hasPii: boolean,
  ): Promise<number> {
    const settings = await this.getResolved();
    if (level === LogLevel.DEBUG) return settings.debugRetentionDays;
    if (hasPii) return settings.piiRetentionDays;
    return settings.operationalRetentionDays;
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
  }
}
