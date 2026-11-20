import { Controller, Get, Inject, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CurrentAuth } from '../auth/auth.decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { DB, type Db } from '../db/db.module.js';
import { users } from '../db/schema/index.js';

@Controller('me')
export class MeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The signed-in user. */
  @Get()
  async me(@CurrentAuth() auth: AccessClaims) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        agencyId: users.agencyId,
        agencyRole: users.agencyRole,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
