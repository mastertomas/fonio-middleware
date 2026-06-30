import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyncSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getOrCreate() {
    const existing = await this.prisma.syncSettings.findUnique({
      where: { id: 'default' },
    });
    if (existing) return existing;

    const envEnabled = this.config.get('SYNC_ENABLED') !== 'false';
    const envInterval = Number(this.config.get('SYNC_INTERVAL_MINUTES') ?? 30);

    return this.prisma.syncSettings.create({
      data: {
        id: 'default',
        autoSyncEnabled: envEnabled,
        intervalMinutes: Number.isFinite(envInterval) ? envInterval : 30,
      },
    });
  }

  async update(data: { autoSyncEnabled?: boolean; intervalMinutes?: number }) {
    await this.getOrCreate();
    return this.prisma.syncSettings.update({
      where: { id: 'default' },
      data,
    });
  }

  async markAutoSyncCompleted() {
    await this.getOrCreate();
    return this.prisma.syncSettings.update({
      where: { id: 'default' },
      data: { lastAutoSyncAt: new Date() },
    });
  }

  async shouldRunAutoSync(): Promise<boolean> {
    const settings = await this.getOrCreate();
    if (!settings.autoSyncEnabled) return false;
    if (!settings.lastAutoSyncAt) return true;
    const elapsed = Date.now() - settings.lastAutoSyncAt.getTime();
    return elapsed >= settings.intervalMinutes * 60_000;
  }
}
