import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class FonioApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('FONIO_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('fonio API key is not configured');
    }

    const headerKey =
      request.headers['x-api-key'] ??
      request.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!headerKey || headerKey !== expected) {
      throw new UnauthorizedException('Invalid fonio API key');
    }

    return true;
  }
}
