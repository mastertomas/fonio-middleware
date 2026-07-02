import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rules: RulesService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedVerificationConfig();
    await this.rules.seedDefaults();
  }

  private async seedAdmin() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (existing) {
      if (existing.role !== AdminRole.SUPER_ADMIN) {
        await this.prisma.adminUser.update({
          where: { email },
          data: { role: AdminRole.SUPER_ADMIN },
        });
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
      },
    });
  }

  private async seedVerificationConfig() {
    const count = await this.prisma.verificationConfig.count();
    if (count > 0) return;

    await this.prisma.verificationConfig.create({
      data: {
        name: 'default',
        requiredFields: [
          'reservationId',
          'phone',
          'arrivalDate',
          'departureDate',
        ],
        minMatchCount: 4,
        isDefault: true,
      },
    });
  }
}
