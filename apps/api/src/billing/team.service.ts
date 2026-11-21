import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BILLING_ERROR_CODES,
  type InvitePreviewWire,
  type TeamInviteWire,
  type TeamWire,
} from '@lex/contracts';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service.js';
import { PASSWORD_MIN_LENGTH } from '../auth/auth.constants.js';
import type { CurrentUser } from '../common/current-user.js';
import { sha256 } from '../common/hash.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { agencies, agencyInvites, users } from '../db/schema/index.js';
import { assertManager, BillingService } from './billing.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteRole = 'admin' | 'member';

export interface AcceptInviteInput {
  password: string;
  /** Needed only when the email has no account yet. */
  fullName?: string;
}

function inviteInvalid(): NotFoundException {
  return new NotFoundException({
    code: BILLING_ERROR_CODES.inviteInvalid,
    message: 'Taklif havolasi eskirgan yoki işlatilgan',
  });
}

/**
 * A company's members and invites. Every member and open invite takes a
 * seat; seats come from the company subscription.
 *
 * Emails aren't sent yet, so creating an invite returns the link and the
 * owner passes it on.
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly billing: BillingService,
    private readonly auth: AuthService,
  ) {}

  async get(user: CurrentUser): Promise<TeamWire> {
    const agencyId = requireAgency(user);
    const [agency] = await this.db
      .select({ name: agencies.name })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    const members = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.agencyRole,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.agencyId, agencyId))
      .orderBy(asc(users.createdAt));
    const invites = await this.db
      .select()
      .from(agencyInvites)
      .where(
        and(
          eq(agencyInvites.agencyId, agencyId),
          isNull(agencyInvites.acceptedAt),
          isNull(agencyInvites.revokedAt),
          gt(agencyInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(agencyInvites.createdAt));

    return {
      agencyId,
      agencyName: agency?.name ?? '',
      seats: await this.billing.seatsPaid(agencyId),
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        fullName: m.fullName,
        role: m.role ?? 'member',
        active: m.passwordHash !== null,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role === 'admin' ? 'admin' : 'member',
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  }

  async invite(
    user: CurrentUser,
    body: { email?: unknown; role?: unknown },
  ): Promise<TeamInviteWire> {
    assertManager(user);
    const agencyId = requireAgency(user);
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 320) {
      throw new BadRequestException('email is invalid');
    }
    const role: InviteRole = body.role === 'admin' ? 'admin' : 'member';

    const [existing] = await this.db
      .select({ agencyId: users.agencyId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing?.agencyId) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.alreadyInTeam,
        message:
          existing.agencyId === agencyId
            ? 'Bu odam allaqaçon jamoada'
            : 'Bu odam boşqa kompaniyada',
      });
    }
    await this.assertSeatFree(agencyId);

    // A new link replaces an open one for the same email.
    await this.db
      .update(agencyInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agencyInvites.agencyId, agencyId),
          eq(agencyInvites.email, email),
          isNull(agencyInvites.acceptedAt),
          isNull(agencyInvites.revokedAt),
        ),
      );

    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(agencyInvites)
      .values({
        agencyId,
        email,
        role,
        tokenHash: sha256(token),
        invitedByUserId: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    return {
      id: row.id,
      email,
      role,
      expiresAt: row.expiresAt.toISOString(),
      inviteUrl: `${this.env.WEB_ORIGIN.replace(/\/$/, '')}/invite/${token}`,
    };
  }

  async revokeInvite(user: CurrentUser, inviteId: string): Promise<void> {
    assertManager(user);
    const agencyId = requireAgency(user);
    await this.db
      .update(agencyInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agencyInvites.id, inviteId),
          eq(agencyInvites.agencyId, agencyId),
          isNull(agencyInvites.acceptedAt),
        ),
      );
  }

  /** Takes a member out of the company; they keep their account (free plan). */
  async removeMember(user: CurrentUser, memberId: string): Promise<void> {
    assertManager(user);
    const member = await this.memberOf(user, memberId);
    if (member.agencyRole === 'owner') {
      throw new ForbiddenException('The owner cannot be removed');
    }
    await this.db
      .update(users)
      .set({ agencyId: null, agencyRole: null })
      .where(eq(users.id, member.id));
  }

  async changeRole(
    user: CurrentUser,
    memberId: string,
    role: unknown,
  ): Promise<void> {
    assertManager(user);
    if (role !== 'admin' && role !== 'member') {
      throw new BadRequestException('role must be admin or member');
    }
    const member = await this.memberOf(user, memberId);
    if (member.agencyRole === 'owner') {
      throw new ForbiddenException("The owner's role cannot change");
    }
    await this.db
      .update(users)
      .set({ agencyRole: role })
      .where(eq(users.id, member.id));
  }

  /* ------------------------------------------------- public invite links -- */

  async preview(token: string): Promise<InvitePreviewWire> {
    const invite = await this.openInvite(token);
    const [agency] = await this.db
      .select({ name: agencies.name })
      .from(agencies)
      .where(eq(agencies.id, invite.agencyId));
    const [inviter] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, invite.invitedByUserId));
    const [account] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, invite.email));
    return {
      agencyName: agency?.name ?? '',
      email: invite.email,
      invitedBy: inviter?.fullName ?? '',
      existingAccount: Boolean(account?.passwordHash),
    };
  }

  /**
   * Joins the company. An existing account confirms its password; a new
   * email creates the account. Either way the person ends up signed in.
   */
  async accept(
    token: string,
    input: AcceptInviteInput,
    client: { userAgent: string | null; ip: string | null },
  ) {
    const invite = await this.openInvite(token);
    if (typeof input.password !== 'string' || input.password === '') {
      throw new BadRequestException('password is required');
    }

    const [account] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, invite.email))
      .limit(1);

    let userId: string;
    if (account?.passwordHash) {
      if (!(await this.auth.verifyPassword(account.passwordHash, input.password))) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (account.agencyId) {
        throw new ConflictException({
          code: BILLING_ERROR_CODES.alreadyInTeam,
          message: 'Siz allaqaçon kompaniya aʼzosisiz',
        });
      }
      userId = account.id;
    } else {
      const fullName = input.fullName?.trim() ?? '';
      if (fullName === '' || fullName.length > 200) {
        throw new BadRequestException('fullName is required');
      }
      if (input.password.length < PASSWORD_MIN_LENGTH) {
        throw new BadRequestException(
          `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        );
      }
      const passwordHash = await this.auth.hashPassword(input.password);
      if (account) {
        // Added earlier without a password: set it now.
        await this.db
          .update(users)
          .set({ fullName, passwordHash })
          .where(eq(users.id, account.id));
        userId = account.id;
      } else {
        const [created] = await this.db
          .insert(users)
          .values({ email: invite.email, fullName, passwordHash })
          .returning({ id: users.id });
        userId = created.id;
      }
    }

    await this.db.transaction(async (tx) => {
      // Conditional, so the same link can't be used twice.
      const [used] = await tx
        .update(agencyInvites)
        .set({ acceptedAt: new Date() })
        .where(
          and(eq(agencyInvites.id, invite.id), isNull(agencyInvites.acceptedAt)),
        )
        .returning({ id: agencyInvites.id });
      if (!used) throw inviteInvalid();
      await tx
        .update(users)
        .set({ agencyId: invite.agencyId, agencyRole: invite.role })
        .where(eq(users.id, userId));
    });

    const [user] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return this.auth.signIn(user, false, client);
  }

  private async openInvite(token: string) {
    if (!token || token.length > 200) throw inviteInvalid();
    const [invite] = await this.db
      .select()
      .from(agencyInvites)
      .where(eq(agencyInvites.tokenHash, sha256(token)))
      .limit(1);
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= new Date()
    ) {
      throw inviteInvalid();
    }
    return invite;
  }

  private async memberOf(user: CurrentUser, memberId: string) {
    const agencyId = requireAgency(user);
    const [member] = await this.db
      .select({ id: users.id, agencyRole: users.agencyRole })
      .from(users)
      .where(and(eq(users.id, memberId), eq(users.agencyId, agencyId)))
      .limit(1);
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private async assertSeatFree(agencyId: string): Promise<void> {
    const [paid, taken] = await Promise.all([
      this.billing.seatsPaid(agencyId),
      this.billing.seatsTaken(agencyId),
    ]);
    if (taken >= paid) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.seatsFull,
        message: 'Böş örin yöq: tarifga foydalanuvçi qöşing',
        seats: paid,
        taken,
      });
    }
  }
}

function requireAgency(user: CurrentUser): string {
  if (!user.agencyId) {
    throw new NotFoundException('Not in a company');
  }
  return user.agencyId;
}
