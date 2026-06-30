import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HostawayModule } from '../hostaway/hostaway.module';
import { RulesModule } from '../rules/rules.module';
import { FonioAvailabilityService } from './fonio-availability.service';
import { FonioCallContextService } from './fonio-call-context.service';
import { FonioController } from './fonio.controller';
import { FonioRequestsService } from './fonio-requests.service';
import { FonioVerificationService } from './fonio-verification.service';

@Module({
  imports: [
    HostawayModule,
    RulesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') ?? '2h',
        },
      }),
    }),
  ],
  controllers: [FonioController],
  providers: [
    FonioAvailabilityService,
    FonioCallContextService,
    FonioVerificationService,
    FonioRequestsService,
  ],
  exports: [FonioCallContextService],
})
export class FonioModule {}
