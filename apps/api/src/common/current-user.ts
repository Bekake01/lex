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
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { users, type AgencyRole } from '../db/schema/index.js';

/** Who is calling. The only identity the AI routes need. */
export interface CurrentUser {
  id: string;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
}

/**
 * Login (sessions, JWT, refresh) is built by the auth track. This guard is the
 * seam: it uses `req.user` when a real auth guard upstream has already set it,
 * and outside production falls back to an `x-user-id` dev header so the AI
 * routes are usable before login lands. When auth ships, delete the fallback —
 * no route or controller changes.
 */
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUser }>();

    if (req.user?.id) return true;

    const headerId = req.headers['x-user-id'];
    if (this.env.NODE_ENV === 'production' || typeof headerId !== 'string') {
      throw new UnauthorizedException();
    }

    const [user] = await this.db
      .select({
        id: users.id,
        agencyId: users.agencyId,
        agencyRole: users.agencyRole,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, headerId))
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
