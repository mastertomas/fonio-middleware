import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [RulesModule],
  providers: [BootstrapService],
})
export class BootstrapModule {}
