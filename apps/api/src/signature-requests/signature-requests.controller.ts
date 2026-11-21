import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  addRecipientsBodySchema,
  createSigningDraftBodySchema,
  signingBoxSchema,
  updateSigningAccessBodySchema,
  updateSigningDraftBodySchema,
  type AddRecipientsBody,
  type CreateSigningDraftBody,
  type SendSigningResponse,
  type SigningRequestDetailWire,
  type SigningRequestList,
  type UpdateSigningAccessBody,
  type UpdateSigningDraftBody,
} from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { pdfAttachment } from '../common/pdf-file.js';
import { ZodBody } from '../common/zod-body.decorator.js';
import { SignatureRequestsService } from './signature-requests.service.js';

/** The sender's signing routes (docs/SIGNING-PLAN.md §4). */
@Controller('signature-requests')
@UseGuards(CurrentUserGuard)
export class SignatureRequestsController {
  constructor(private readonly requests: SignatureRequestsService) {}

  /** A draft from an uploaded PDF (415 for anything else). */
  @Post()
  create(
    @User() user: CurrentUser,
    @ZodBody(createSigningDraftBodySchema) body: CreateSigningDraftBody,
  ): Promise<SigningRequestDetailWire> {
    return this.requests.createDraft(user, body);
  }

  /** `box=sent` (default): my sends. `box=inbox`: sends where my email is a recipient. */
  @Get()
  list(
    @User() user: CurrentUser,
    @Query('box') box?: string,
  ): Promise<SigningRequestList> {
    const parsed = signingBoxSchema.safeParse(box ?? 'sent');
    if (!parsed.success)
      throw new BadRequestException('box must be sent or inbox');
    return this.requests.list(user, parsed.data);
  }

  @Get(':id')
  detail(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SigningRequestDetailWire> {
    return this.requests.detail(user, id);
  }

  @Patch(':id')
  update(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateSigningDraftBodySchema) body: UpdateSigningDraftBody,
  ): Promise<SigningRequestDetailWire> {
    return this.requests.updateDraft(user, id, body);
  }

  @Patch(':id/access')
  access(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateSigningAccessBodySchema) body: UpdateSigningAccessBody,
  ): Promise<SigningRequestDetailWire> {
    return this.requests.updateAccess(user, id, body);
  }

  /** Snapshot, queue the summary + invites, return every link. */
  @Post(':id/send')
  send(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SendSigningResponse> {
    return this.requests.send(user, id);
  }

  @Post(':id/recipients')
  addRecipients(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(addRecipientsBodySchema) body: AddRecipientsBody,
  ): Promise<SendSigningResponse> {
    return this.requests.addRecipients(user, id, body);
  }

  @Post(':id/cancel')
  cancel(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SigningRequestDetailWire> {
    return this.requests.cancel(user, id);
  }

  @Get(':id/recipients/:rid/signed')
  async signed(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rid', ParseUUIDPipe) rid: string,
  ): Promise<StreamableFile> {
    const file = await this.requests.download(user, id, rid, 'signed');
    return pdfAttachment(file.bytes, file.fileName);
  }

  @Get(':id/recipients/:rid/certificate')
  async certificate(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rid', ParseUUIDPipe) rid: string,
  ): Promise<StreamableFile> {
    const file = await this.requests.download(user, id, rid, 'certificate');
    return pdfAttachment(file.bytes, file.fileName);
  }
}
