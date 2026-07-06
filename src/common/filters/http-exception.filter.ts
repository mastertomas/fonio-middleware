import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? message;
        details = obj;
      }
    } else if (!isProd && exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const clientSafeFields = [
      'verified',
      'hint',
      'hintDe',
      'whatToAskDe',
      'stillNeedCount',
      'matchedFields',
      'missingFields',
      'requiredMinMatches',
      'reservationId',
      'fonioHint',
      'ambiguousCount',
    ];

    let clientDetails: Record<string, unknown> | undefined;
    if (typeof details === 'object' && details !== null) {
      const obj = details as Record<string, unknown>;
      clientDetails = {};
      for (const key of clientSafeFields) {
        if (obj[key] !== undefined) clientDetails[key] = obj[key];
      }
      if (!Object.keys(clientDetails).length) clientDetails = undefined;
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(clientDetails ?? {}),
      ...(isProd || status < 500
        ? {}
        : { error: exception instanceof Error ? exception.name : 'Error' }),
      ...(typeof details === 'object' &&
      details !== null &&
      !isProd &&
      status < 500
        ? { details }
        : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
