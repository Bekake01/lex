import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AccessClaims } from './token.service.js';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Lets a route (or a whole controller) through without an access token.
 * Every other route requires one, so a new route is protected by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** A request that passed the access-token guard. */
export interface AuthenticatedRequest extends Request {
  auth: AccessClaims;
}

/**
 * The caller's user and session ids, from the access token.
 * Only on protected routes: a @Public() route has none.
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessClaims =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);

/** The token from `Authorization: Bearer <token>`, if there is one. */
export function bearerToken(req: Request): string | undefined {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && extra === undefined
    ? token
    : undefined;
}
