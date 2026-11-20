import {
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.decorators.js';
import { DB, type Db } from '../db/db.module.js';
import { users, type AgencyRole } from '../db/schema/index.js';

/** Who is calling. The only identity the AI routes need. */
export interface CurrentUser {
  id: string;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
}

/**
 * Loads the caller's user row for the AI routes. Runs after the global
 * `AccessTokenGuard`, which has already verified the JWT and set `req.auth`.
 */
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { user?: CurrentUser }>();
    if (req.user?.id) return true;

    const userId = req.auth?.userId;
    if (!userId) throw new UnauthorizedException();

    const [user] = await this.db
      .select({
        id: users.id,
        agencyId: users.agencyId,
        agencyRole: users.agencyRole,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.status !== 'active') throw new UnauthorizedException();

    req.user = {
      id: user.id,
      agencyId: user.agencyId,
      agencyRole: user.agencyRole,
    };
    return true;
  }
}

/** `@User() user: CurrentUser` on any route behind `CurrentUserGuard`. */
export const User = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUser }>();
    if (!req.user) throw new UnauthorizedException();
    return req.user;
  },
);
