import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  askQuestionBodySchema,
  type AskQuestionResponse,
  type LegalChatListItem,
  type LegalChatWire,
} from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { ZodBody } from '../common/zod-body.decorator.js';
import { LegalQaService } from './legal-qa.service.js';

/**
 * General legal questions (`/ask`). A POST returns the chat and the pending
 * answer's id; the frontend polls `GET /legal-chats/:id` until it is settled.
 */
@Controller('legal-chats')
@UseGuards(CurrentUserGuard)
export class LegalQaController {
  constructor(private readonly qa: LegalQaService) {}

  @Get()
  list(@User() user: CurrentUser): Promise<LegalChatListItem[]> {
    return this.qa.list(user);
  }

  @Post()
  start(
    @User() user: CurrentUser,
    @ZodBody(askQuestionBodySchema) body: { text: string },
  ): Promise<AskQuestionResponse> {
    return this.qa.start(user, body.text);
  }

  @Get(':id')
  get(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) chatId: string,
  ): Promise<LegalChatWire> {
    return this.qa.get(user, chatId);
  }

  @Post(':id/messages')
  followUp(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @ZodBody(askQuestionBodySchema) body: { text: string },
  ): Promise<AskQuestionResponse> {
    return this.qa.followUp(user, chatId, body.text);
  }
}
