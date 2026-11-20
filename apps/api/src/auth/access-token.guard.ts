import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  bearerToken,
  IS_PUBLIC,
  type AuthenticatedRequest,
} from './auth.decorators.js';
import { TokenService } from './token.service.js';

/**
 * Global guard: every route needs a valid access token unless it is @Public().
 *
 * Checks only the JWT (signature, expiry, `typ: "access"`), with no DB lookup.
 * So a revoked session or a suspended user keeps access until the token
 * expires (up to 15 min). That delay is accepted; refresh re-checks the user.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req);
    if (!token) {
      throw new UnauthorizedException();
    }
    req.auth = await this.tokens.verifyAccess(token);
    return true;
  }
}
