import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Redirect('/docs', 302)
  root() {
    return;
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'vermietung-middleware',
      timestamp: new Date().toISOString(),
    };
  }
}
