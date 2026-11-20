import { BadRequestException } from '@nestjs/common';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from './auth.constants.js';

export interface LoginInput {
  /** Already normalized the way users stores it: lower(trim(email)). */
  email: string;
  password: string;
  rememberMe: boolean;
}

export function parseLoginBody(body: unknown): LoginInput {
  const { email, password, rememberMe } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (
    typeof email !== 'string' ||
    email.trim() === '' ||
    email.length > EMAIL_MAX_LENGTH
  ) {
    throw new BadRequestException('email is required');
  }
  if (
    typeof password !== 'string' ||
    password === '' ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException('password is required');
  }
  if (rememberMe !== undefined && typeof rememberMe !== 'boolean') {
    throw new BadRequestException('rememberMe must be a boolean');
  }

  return {
    email: email.trim().toLowerCase(),
    password,
    rememberMe: rememberMe ?? false,
  };
}
