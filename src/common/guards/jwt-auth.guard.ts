import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Admin authentication required');
    }
    return user;
  }
}

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly minRole: 'VIEWER' | 'EDITOR' | 'ADMIN' = 'VIEWER') {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role: string } }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const order = ['VIEWER', 'EDITOR', 'ADMIN'];
    const userIdx = order.indexOf(user.role);
    const minIdx = order.indexOf(this.minRole);
    if (userIdx < minIdx) {
      throw new UnauthorizedException('Insufficient permissions');
    }
    return true;
  }
}
