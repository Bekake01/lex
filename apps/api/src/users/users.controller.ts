import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { DB, type Db } from '../db/db.module.js';
import { users, type NewUser } from '../db/schema/index.js';

// Small test endpoints to check the database connection.
@Controller('users')
export class UsersController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  list() {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        agencyId: users.agencyId,
        agencyRole: users.agencyRole,
        createdAt: users.createdAt,
      })
      .from(users);
  }

  @Post()
  async create(@Body() body: Pick<NewUser, 'email' | 'fullName'>) {
    const [user] = await this.db
      .insert(users)
      .values({
        email: body.email.trim().toLowerCase(),
        fullName: body.fullName,
      })
      .returning({ id: users.id, email: users.email, fullName: users.fullName });
    return user;
  }
}
