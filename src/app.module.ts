import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { FonioModule } from './fonio/fonio.module';
import { HealthController } from './health.controller';
import { HostawayModule } from './hostaway/hostaway.module';
import { LoggingModule } from './logging/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LoggingModule,
    HostawayModule,
    RulesModule,
    FonioModule,
    AdminModule,
    WebhooksModule,
    BootstrapModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
