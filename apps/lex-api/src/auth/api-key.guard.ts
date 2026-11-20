import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env.js';
import { IS_PUBLIC } from './public.decorator.js';

export const API_KEY_HEADER = 'x-lex-api-key';

/**
 * Global guard: every route needs a valid `x-lex-api-key` unless marked
 * `@Public()`. Both sides are hashed first so the comparison is constant-time
 * regardless of the presented key's length.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.expected = digest(env.LEX_API_KEY);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const presented = req.headers[API_KEY_HEADER];
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new UnauthorizedException();
    }
    if (!timingSafeEqual(digest(presented), this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
