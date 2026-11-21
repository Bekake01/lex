import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import {
  openLinkStartBodySchema,
  SIGN_TICKET_HEADER,
  submitSigningBodySchema,
  unlockBodySchema,
  type LockedView,
  type OpenLinkInfo,
  type OpenLinkStartResponse,
  type RecipientSummaryWire,
  type SignerView,
  type SigningStatus,
  type SubmitSigningResponse,
  type UnlockResponse,
} from '@lex/contracts';
import type { Request } from 'express';
import type { ZodType } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { contentDisposition, pdfAttachment } from '../common/pdf-file.js';
import { notValid, SigningService } from './signing.service.js';

/**
 * The PUBLIC signing surface: a person has a token (and maybe a password
 * ticket), never an account. Every failure is the same 404 — including a bad
 * body, whose reasons would describe the accepted shape to anyone — except a
 * wrong password (401) and a locked link (423), which the person must be told.
 *
 * `apps/sign` calls these through its own pass-through, which forwards the
 * client IP as `x-client-ip` and the ticket as `x-sign-ticket`.
 */
@Public()
@Controller('sign')
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  /* ------------------------------------------- open link (before :token) -- */

  @Get('open/:publicToken')
  @Header('Cache-Control', 'no-store')
  openLink(@Param('publicToken') publicToken: string): Promise<OpenLinkInfo> {
    return this.signing.openLinkInfo(publicToken);
  }

  @Post('open/:publicToken/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  openLinkStart(
    @Param('publicToken') publicToken: string,
    @Body() body: unknown,
  ): Promise<OpenLinkStartResponse> {
    return this.signing.openLinkStart(
      publicToken,
      parseOr404(openLinkStartBodySchema, body),
    );
  }

  /* ------------------------------------------------------------ per link -- */

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  view(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<SignerView | LockedView> {
    return this.signing.view(token, ticket);
  }

  @Post(':token/unlock')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  unlock(
    @Param('token') token: string,
    @Body() body: unknown,
  ): Promise<UnlockResponse> {
    return this.signing.unlock(
      token,
      parseOr404(unlockBodySchema, body).password,
    );
  }

  @Get(':token/summary')
  @Header('Cache-Control', 'no-store')
  summary(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<RecipientSummaryWire> {
    return this.signing.summaryForToken(token, ticket);
  }

  @Get(':token/document')
  @Header('Cache-Control', 'no-store')
  async document(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<StreamableFile> {
    const bytes = await this.signing.document(token, ticket);
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: contentDisposition('inline', 'document.pdf'),
      length: bytes.byteLength,
    });
  }

  @Post(':token/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  submit(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<SubmitSigningResponse> {
    return this.signing.submit(
      token,
      ticket,
      parseOr404(submitSigningBodySchema, body),
      clientIp(req),
      userAgent(req),
    );
  }

  @Get(':token/status')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<SigningStatus> {
    return this.signing.status(token, ticket);
  }

  @Get(':token/signed')
  @Header('Cache-Control', 'no-store')
  async signed(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<StreamableFile> {
    const file = await this.signing.file(token, ticket, 'signed');
    return pdfAttachment(file.bytes, file.fileName);
  }

  @Get(':token/certificate')
  @Header('Cache-Control', 'no-store')
  async certificate(
    @Param('token') token: string,
    @Headers(SIGN_TICKET_HEADER) ticket?: string,
  ): Promise<StreamableFile> {
    const file = await this.signing.file(token, ticket, 'certificate');
    return pdfAttachment(file.bytes, file.fileName);
  }
}

function parseOr404<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) notValid();
  return parsed.data;
}

/** Set by the sign app's pass-through (first hop of x-forwarded-for there). */
function clientIp(req: Request): string | null {
  const supplied = req.headers['x-client-ip'];
  if (typeof supplied === 'string' && supplied.length > 0) {
    return supplied.slice(0, 64);
  }
  return req.ip ?? null;
}

function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 512) : null;
}
