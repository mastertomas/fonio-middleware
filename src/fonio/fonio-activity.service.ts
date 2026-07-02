import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../logging/audit-log.service';
import {
  buildFonioActivityMetadata,
  FonioActivityOutcome,
} from './fonio-activity.util';

@Injectable()
export class FonioActivityService {
  constructor(private readonly audit: AuditLogService) {}

  async record(params: {
    action: string;
    callId?: string | null;
    requestReceived?: unknown;
    middlewareAction: string;
    outcome: FonioActivityOutcome;
    outcomeDetail?: string;
    responseRecorded?: unknown;
    statusCode?: number;
    durationMs?: number;
    method?: string;
    path?: string;
    extra?: Record<string, unknown>;
  }) {
    await this.audit.log({
      source: 'fonio',
      action: params.action,
      method: params.method,
      path: params.path,
      statusCode: params.statusCode,
      durationMs: params.durationMs,
      metadata: buildFonioActivityMetadata({
        callId: params.callId,
        requestReceived: params.requestReceived,
        middlewareAction: params.middlewareAction,
        outcome: params.outcome,
        outcomeDetail: params.outcomeDetail,
        responseRecorded: params.responseRecorded,
        extra: params.extra,
      }),
    });
  }
}
