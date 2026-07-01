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
  @ApiOperation({ summary: 'Health check (for monitoring / load balancers)' })
  async health() {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    const lastSync = await this.prisma.syncJob.findFirst({
      where: { status: 'completed' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, jobType: true },
    });

    const failedSync = await this.prisma.syncJob.findFirst({
      where: { status: 'failed' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, error: true },
    });

    const status = database === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      service: 'vermietung-middleware',
      timestamp: new Date().toISOString(),
      checks: {
        database,
      },
      sync: {
        lastCompletedAt: lastSync?.finishedAt ?? null,
        lastJobType: lastSync?.jobType ?? null,
        lastFailedAt: failedSync?.finishedAt ?? null,
        lastError: failedSync?.error ?? null,
      },
    };
  }
}
