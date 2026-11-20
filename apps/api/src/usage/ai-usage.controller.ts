import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AiUsageWire } from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { AiUsageService } from './ai-usage.service.js';

@Controller('me')
@UseGuards(CurrentUserGuard)
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  /** What the dashboard shows: reviews used this month against the limit. */
  @Get('ai-usage')
  get(@User() user: CurrentUser): Promise<AiUsageWire> {
    return this.usage.get(user);
  }
}
