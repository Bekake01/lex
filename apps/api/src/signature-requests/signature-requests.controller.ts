import { Controller, Post, UseGuards } from '@nestjs/common';
import {
  createSignatureRequestBodySchema,
  type CreateSignatureRequestBody,
  type CreateSignatureRequestResponse,
} from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { ZodBody } from '../common/zod-body.decorator.js';
import { SignatureRequestsService } from './signature-requests.service.js';

@Controller('signature-requests')
@UseGuards(CurrentUserGuard)
export class SignatureRequestsController {
  constructor(private readonly requests: SignatureRequestsService) {}

  /** Send for signature: enqueues the summaries, then the invites. */
  @Post()
  create(
    @User() user: CurrentUser,
    @ZodBody(createSignatureRequestBodySchema) body: CreateSignatureRequestBody,
  ): Promise<CreateSignatureRequestResponse> {
    return this.requests.create(user, body);
  }
}
