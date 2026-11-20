import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { sessions, users } from '../db/schema/index.js';
import {
  REFRESH_GRACE_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS_NOT_REMEMBERED,
  SESSION_IDLE_MS_REMEMBERED,
} from './auth.constants.js';
import {
  formatRefreshToken,
  hashRefreshSecret,
  matchRefreshToken,
  newRefreshSecret,
  parseRefreshToken,
} from './refresh-token.js';

// Long user agents are cut, so a client can't fill the table with junk.
const USER_AGENT_MAX_LENGTH = 512;

export const SESSION_INVALID = 'Session is no longer valid';
export const ACCOUNT_SUSPENDED = 'Your account is suspended';

export interface CreateSessionInput {
  userId: string;
  rememberMe: boolean;
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  sessionId: string;
  /** `<session id>.<secret>`. Goes to the client once and is never stored. */
  refreshToken: string;
  rememberMe: boolean;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

/** The signed-in user, as login and refresh return it. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
}

export type RefreshOutcome =
  /** The current token: rotated, the client gets a new cookie. */
  | { kind: 'rotated'; session: IssuedSession; user: SessionUser }
  /** The previous token within the grace period: access token only, no new cookie. */
  | { kind: 'grace'; sessionId: string; user: SessionUser }
  /** An old token: the session has been revoked. */
  | { kind: 'reused'; sessionId: string; userId: string };

/** Refresh tokens and the `sessions` rows behind them. */
@Injectable()
export class SessionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: CreateSessionInput): Promise<IssuedSession> {
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);
    const idleExpiresAt = nextIdleExpiry(
      now,
      input.rememberMe,
      absoluteExpiresAt,
    );
    const secret = newRefreshSecret();

    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: input.userId,
        rememberMe: input.rememberMe,
        tokenHash: hashRefreshSecret(secret),
        userAgent: input.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ip: input.ip,
        idleExpiresAt,
        absoluteExpiresAt,
      })
      .returning({ id: sessions.id });

    return {
      sessionId: row.id,
      refreshToken: formatRefreshToken(row.id, secret),
      rememberMe: input.rememberMe,
      idleExpiresAt,
      absoluteExpiresAt,
    };
  }

  /**
   * Checks a refresh token and rotates it.
   *
   * Throws 401 when the token or session is not valid, and 403 when the user
   * is suspended (the session is left as is). Returns `reused` after revoking
   * the session, so the revoke is committed.
   */
  async refresh(token: string): Promise<RefreshOutcome> {
    const parsed = parseRefreshToken(token);
    if (!parsed) {
      throw new UnauthorizedException(SESSION_INVALID);
    }
    const { sessionId, secret } = parsed;
    const presentedHash = hashRefreshSecret(secret);

    return this.db.transaction(async (tx) => {
      // The row lock makes parallel refreshes of one session take turns: the
      // first rotates, the next finds its token is now the previous one and
      // gets the grace path instead of a second rotation.
      const [row] = await tx
        .select({
          session: sessions,
          user: { id: users.id, email: users.email, fullName: users.fullName },
          userStatus: users.status,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, sessionId))
        .for('update', { of: sessions });

      const now = new Date();
      if (
        !row ||
        row.session.revokedAt ||
        row.session.idleExpiresAt <= now ||
        row.session.absoluteExpiresAt <= now
      ) {
        throw new UnauthorizedException(SESSION_INVALID);
      }
      const session = row.session;

      const match = matchRefreshToken(
        { presentedHash, ...session },
        now,
        REFRESH_GRACE_MS,
      );

      // A real session id with a token that is neither: an old token came
      // back, so one of its copies was stolen. End the session for both.
      if (match === 'reuse') {
        await tx
          .update(sessions)
          .set({ revokedAt: now, revokedReason: 'reuse_detected' })
          .where(eq(sessions.id, sessionId));
        return { kind: 'reused', sessionId, userId: session.userId };
      }

      if (row.userStatus !== 'active') {
        throw new ForbiddenException(ACCOUNT_SUSPENDED);
      }

      if (match === 'grace') {
        await tx
          .update(sessions)
          .set({ lastUsedAt: now })
          .where(eq(sessions.id, sessionId));
        return { kind: 'grace', sessionId, user: row.user };
      }

      const newSecret = newRefreshSecret();
      const idleExpiresAt = nextIdleExpiry(
        now.getTime(),
        session.rememberMe,
        session.absoluteExpiresAt,
      );
      await tx
        .update(sessions)
        .set({
          tokenHash: hashRefreshSecret(newSecret),
          previousTokenHash: session.tokenHash,
          rotatedAt: now,
          idleExpiresAt,
          lastUsedAt: now,
        })
        .where(eq(sessions.id, sessionId));

      return {
        kind: 'rotated',
        session: {
          sessionId,
          refreshToken: formatRefreshToken(sessionId, newSecret),
          rememberMe: session.rememberMe,
          idleExpiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
        },
        user: row.user,
      };
    });
  }

  /**
   * Logout: revokes the session the token belongs to. Accepts the current
   * token, or the previous one within the grace period (a tab that hasn't
   * seen the newest cookie yet). Anything else changes nothing.
   */
  async revoke(token: string): Promise<boolean> {
    const parsed = parseRefreshToken(token);
    if (!parsed) {
      return false;
    }
    const presentedHash = hashRefreshSecret(parsed.secret);
    const graceSeconds = REFRESH_GRACE_MS / 1000;

    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'logout' })
      .where(
        and(
          eq(sessions.id, parsed.sessionId),
          isNull(sessions.revokedAt),
          or(
            eq(sessions.tokenHash, presentedHash),
            and(
              eq(sessions.previousTokenHash, presentedHash),
              gt(
                sessions.rotatedAt,
                sql`now() - make_interval(secs => ${graceSeconds})`,
              ),
            ),
          ),
        ),
      )
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }
}

/** Idle expiry from `now`, never past the absolute expiry. */
function nextIdleExpiry(
  now: number,
  rememberMe: boolean,
  absoluteExpiresAt: Date,
): Date {
  const idleMs = rememberMe
    ? SESSION_IDLE_MS_REMEMBERED
    : SESSION_IDLE_MS_NOT_REMEMBERED;
  return new Date(Math.min(now + idleMs, absoluteExpiresAt.getTime()));
}
