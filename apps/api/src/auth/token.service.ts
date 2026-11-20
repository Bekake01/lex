import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { ENV, type Env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';

// Pinned so a token can never pick its own algorithm (e.g. "none").
const ALGORITHM = 'HS256';
const ACCESS_TYP = 'access';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Signs and verifies the api's access tokens (HS256, `JWT_SECRET`). */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  signAccess(claims: AccessClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: claims.sessionId, typ: ACCESS_TYP })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  /** Throws 401 (no message) for anything but a valid access token. */
  async verifyAccess(token: string): Promise<AccessClaims> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
      }));
    } catch {
      // Bad signature, expired, malformed: the caller only needs "not valid".
      throw new UnauthorizedException();
    }
    if (
      payload.typ !== ACCESS_TYP ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
