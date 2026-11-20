import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { users } from '../db/schema/index.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { PasswordHasher } from './password.js';
import type { LoginInput } from './request-bodies.js';
import {
  ACCOUNT_SUSPENDED,
  SESSION_INVALID,
  SessionService,
  type IssuedSession,
  type SessionUser,
} from './session.service.js';
import { TokenService } from './token.service.js';

export interface ClientInfo {
  userAgent: string | null;
  ip: string | null;
}

export interface SignedIn {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
  session: IssuedSession;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
  /** Set when the token was rotated; null on the grace path (no new cookie). */
  rotatedSession: IssuedSession | null;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

/**
 * Login, refresh and logout, as in tms but without tenants: a user signs in
 * straight to their own account (individual or agency member alike).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Runs argon2 even when the email doesn't exist, so that case takes as long
  // as a wrong password and the response time doesn't reveal which emails are
  // registered.
  private readonly passwords = new PasswordHasher();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async login(input: LoginInput, client: ClientInfo): Promise<SignedIn> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    const passwordOk = await this.passwords.verify(
      user?.passwordHash,
      input.password,
    );
    if (!user || !passwordOk) {
      this.logger.warn({ event: 'login_failed', email: input.email });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Only reached with the correct password, so this reveals nothing to
    // someone guessing.
    if (user.status !== 'active') {
      throw new ForbiddenException(ACCOUNT_SUSPENDED);
    }

    const session = await this.sessions.create({
      userId: user.id,
      rememberMe: input.rememberMe,
      userAgent: client.userAgent,
      ip: client.ip,
    });
    const accessToken = await this.tokens.signAccess({
      userId: user.id,
      sessionId: session.sessionId,
    });
    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      session,
    };
  }

  async refresh(token: string | undefined): Promise<RefreshResult> {
    if (!token) {
      throw new UnauthorizedException(SESSION_INVALID);
    }
    const outcome = await this.sessions.refresh(token);

    if (outcome.kind === 'reused') {
      this.logger.warn({
        event: 'refresh_token_reuse',
        sessionId: outcome.sessionId,
        userId: outcome.userId,
      });
      throw new UnauthorizedException(SESSION_INVALID);
    }

    const sessionId =
      outcome.kind === 'rotated'
        ? outcome.session.sessionId
        : outcome.sessionId;
    const accessToken = await this.tokens.signAccess({
      userId: outcome.user.id,
      sessionId,
    });
    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: outcome.user,
      rotatedSession: outcome.kind === 'rotated' ? outcome.session : null,
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
