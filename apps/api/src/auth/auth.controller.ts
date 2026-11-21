import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import { Public } from './auth.decorators.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { parseLoginBody, parseRegisterBody } from './request-bodies.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  type RefreshCookieConfig,
} from './refresh-cookie.js';
import type { SessionUser } from './session.service.js';

/** Body of a successful login or refresh. */
export interface SignedInResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

// These endpoints are how a client gets an access token, so they can't require
// one. Each checks its own credential: password or refresh cookie.
@Public()
@Controller('auth')
export class AuthController {
  private readonly cookie: RefreshCookieConfig;

  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) env: Env,
  ) {
    this.cookie = {
      secure: env.NODE_ENV === 'production',
      path: env.REFRESH_COOKIE_PATH,
    };
  }

  /** Email + password. Returns the access token and sets the refresh cookie. */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignedInResponse> {
    const result = await this.auth.login(parseLoginBody(body), clientInfo(req));
    setRefreshCookie(res, result.session, this.cookie);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  /** Sign-up (free plan). Same response and cookie as login. */
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignedInResponse> {
    const result = await this.auth.register(
      parseRegisterBody(body),
      clientInfo(req),
    );
    setRefreshCookie(res, result.session, this.cookie);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  /**
   * A new access token from the refresh cookie (send with credentials).
   * Rotates the cookie; on 401/403 the cookie is cleared and the user must
   * sign in again.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignedInResponse> {
    try {
      const result = await this.auth.refresh(readRefreshCookie(req));
      // Not set on the grace path: the browser already holds the newer
      // cookie from the request that rotated first.
      if (result.rotatedSession) {
        setRefreshCookie(res, result.rotatedSession, this.cookie);
      }
      return {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      };
    } catch (error) {
      // The cookie won't work again, so drop it. The frontend goes to the login page.
      if (error instanceof HttpException) {
        clearRefreshCookie(res, this.cookie);
      }
      throw error;
    }
  }

  /**
   * Ends this browser's session. Always succeeds, even without a cookie or
   * with a dead session, so the user can always log out.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readRefreshCookie(req);
    if (token) {
      await this.auth.logout(token);
    }
    clearRefreshCookie(res, this.cookie);
  }
}

export function clientInfo(req: Request): ClientInfo {
  return {
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  };
}
