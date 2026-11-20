import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  acceptEditsBodySchema,
  createMessageBodySchema,
  createReviewBodySchema,
  type AcceptEditsResponse,
  type CreateMessageResponse,
  type CreateReviewResponse,
  type PartyWire,
  type ReviewMessageWire,
  type ReviewWire,
} from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { ZodBody } from '../common/zod-body.decorator.js';
import { EditsService } from './edits.service.js';
import { ReviewService } from './review.service.js';

/**
 * The review API the frontend builds against (`packages/contracts/src/ai.ts`).
 *
 * Async pattern: a POST returns an id and the frontend polls the GET every
 * couple of seconds. Streaming can be added later without changing a shape.
 */
@Controller()
@UseGuards(CurrentUserGuard)
export class AiReviewController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly edits: EditsService,
  ) {}

  @Post('documents/:id/reviews')
  createReview(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) documentId: string,
    @ZodBody(createReviewBodySchema) body: { language?: 'uz' | 'ru' | 'en' },
  ): Promise<CreateReviewResponse> {
    return this.reviews.createReview(user, documentId, body.language ?? 'uz');
  }

  @Get('documents/:id/reviews')
  listReviews(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<ReviewWire[]> {
    return this.reviews.listReviews(user, documentId);
  }

  @Get('documents/:id/parties')
  parties(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<PartyWire[]> {
    return this.reviews.parties(user, documentId);
  }

  @Get('reviews/:id')
  getReview(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
  ): Promise<ReviewWire> {
    return this.reviews.getReview(user, reviewId);
  }

  @Get('reviews/:id/messages')
  listMessages(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
  ): Promise<ReviewMessageWire[]> {
    return this.reviews.listMessages(user, reviewId);
  }

  @Post('reviews/:id/messages')
  createMessage(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @ZodBody(createMessageBodySchema) body: { text: string },
  ): Promise<CreateMessageResponse> {
    return this.reviews.createMessage(user, reviewId, body.text);
  }

  @Post('reviews/:id/edits/accept')
  acceptEdits(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @ZodBody(acceptEditsBodySchema) body: { editIds: string[] },
  ): Promise<AcceptEditsResponse> {
    return this.edits.accept(user, reviewId, body.editIds);
  }

  /** Counterpart to accept. Add it to `ai.ts` when the frontend needs it. */
  @Post('reviews/:id/edits/reject')
  rejectEdits(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @ZodBody(acceptEditsBodySchema) body: { editIds: string[] },
  ): Promise<{ rejected: number }> {
    return this.edits.reject(user, reviewId, body.editIds);
  }
}
