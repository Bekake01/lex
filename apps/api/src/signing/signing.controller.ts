import { Controller, Get, Param } from '@nestjs/common';
import type { RecipientSummaryWire } from '@lex/contracts';
import { SigningService } from './signing.service.js';

/**
 * Public: a recipient has no account, only a token. No guard, and nothing here
 * reaches Claude — the summary was computed at send time.
 *
 * `apps/sign` has to allow `GET /sign/:token/summary` in its relay allowlist.
 */
@Controller('sign')
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  @Get(':token/summary')
  summary(@Param('token') token: string): Promise<RecipientSummaryWire> {
    return this.signing.summaryForToken(token);
  }
}
