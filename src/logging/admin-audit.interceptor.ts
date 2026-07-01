import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { LogLevel } from '@prisma/client';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string; email: string; role: string };
      ip?: string;
    }>();
    const method = request.method;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.log({
            level: LogLevel.SECURITY,
            source: 'admin',
            action: `${method} ${request.url}`,
            method,
            path: request.url,
            statusCode: 200,
            durationMs: Date.now() - started,
            metadata: {
              adminId: request.user?.id,
              role: request.user?.role,
            },
            ip: request.ip,
          });
        },
        error: (error: { status?: number; message?: string }) => {
          void this.audit.log({
            level: LogLevel.WARN,
            source: 'admin',
            action: `${method} ${request.url}`,
            method,
            path: request.url,
            statusCode: error?.status ?? 500,
            durationMs: Date.now() - started,
            metadata: {
              adminId: request.user?.id,
              role: request.user?.role,
              error: error?.message,
            },
            ip: request.ip,
          });
        },
      }),
    );
  }
}
