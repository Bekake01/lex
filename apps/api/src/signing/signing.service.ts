import { randomBytes } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  compactPhone,
  SIGNING_ERROR_CODES,
  type LockedView,
  type OpenLinkInfo,
  type OpenLinkStartBody,
  type OpenLinkStartResponse,
  type RecipientSummaryWire,
  type SignerView,
  type SigningStatus,
  type SubmitSigningBody,
  type SubmitSigningResponse,
  type UnlockResponse,
} from '@lex/contracts';
import { decodeSignaturePng } from '@lex/crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { toRecipientSummaryWire } from '../ai-review/mappers.js';
import { PasswordHasher } from '../auth/password.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import {
  documents,
  recipientSummaries,
  recipients,
  signatureRequests,
  users,
  type Recipient,
  type SignatureRequest,
} from '../db/schema/index.js';
import { StorageService } from '../storage/storage.service.js';
import { resolveFieldValues } from './field-values.js';
import { issueTicket, verifyTicket } from './ticket.js';

/**
 * One 404 for every reason a token does not work — unknown, draft, cancelled,
 * already signed where that matters, bad body. A caller holding a wrong token
 * learns nothing about which of those it is.
 */
export function notValid(): never {
  throw new NotFoundException('Not found');
}

/** Wrong passwords on one link before it locks (the sender resets it). */
export const MAX_PASSWORD_ATTEMPTS = 10;

/** base64url, 43 chars for a 32-byte token; a generous range for old/demo tokens. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,200}$/;

interface Loaded {
  recipient: Recipient;
  request: SignatureRequest;
  senderName: string;
  /** A password is set and no valid ticket came with the call. */
  locked: boolean;
}

/**
 * The public signing slice: everything a person with a link (and maybe the
 * password) can do. It reads stored rows and nothing else — no model call is
 * reachable from a signing link, so the page only ever shows what was
 * snapshotted at send time.
 */
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly passwords = new PasswordHasher();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
  ) {}

  /* --------------------------------------------------------------- views -- */

  async view(token: string, ticket?: string): Promise<SignerView | LockedView> {
    const { recipient, request, senderName, locked } = await this.load(
      token,
      ticket,
    );
    if (locked) return { locked: true, title: request.title };

    await this.markViewed(recipient);
    const [summary] = await this.db
      .select({ id: recipientSummaries.id })
      .from(recipientSummaries)
      .where(eq(recipientSummaries.signatureRequestId, request.id))
      .limit(1);

    return {
      title: request.title,
      senderName,
      message: request.message,
      recipientName: recipient.fullName,
      pageCount: request.pageCount ?? 1,
      pageSizes: request.pageSizes ?? [],
      fields: request.fields,
      signed: recipient.status === 'signed',
      // A cancelled send never gets this far (it is the uniform 404).
      cancelled: false,
      hasSummary: summary !== undefined,
    };
  }

  /** The send's one summary (written at send time). None → 404, the page skips the step. */
  async summaryForToken(
    token: string,
    ticket?: string,
  ): Promise<RecipientSummaryWire> {
    const { recipient, request, locked } = await this.load(token, ticket);
    if (locked) notValid();

    const [summary] = await this.db
      .select()
      .from(recipientSummaries)
      .where(eq(recipientSummaries.signatureRequestId, request.id))
      .limit(1);
    if (!summary) notValid();

    await this.markViewed(recipient);
    return toRecipientSummaryWire(summary);
  }

  /** The original PDF that was sent. */
  async document(token: string, ticket?: string): Promise<Uint8Array> {
    const { request, locked } = await this.load(token, ticket);
    if (locked) notValid();
    const [doc] = await this.db
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(eq(documents.id, request.documentId))
      .limit(1);
    if (!doc) notValid();
    return this.storage.get(doc.storageKey);
  }

  /* ------------------------------------------------------------ password -- */

  /** Right password → a 2 h ticket. Wrong → 401 and one more attempt counted; 10 → 423. */
  async unlock(token: string, password: string): Promise<UnlockResponse> {
    const { recipient, request } = await this.load(token, undefined);
    if (!request.passwordHash) return { ticket: this.ticket(token) };

    if (recipient.failedPasswordAttempts >= MAX_PASSWORD_ATTEMPTS) {
      throw locked();
    }
    if (!(await this.passwords.verify(request.passwordHash, password))) {
      await this.db
        .update(recipients)
        .set({
          failedPasswordAttempts: sql`${recipients.failedPasswordAttempts} + 1`,
        })
        .where(eq(recipients.id, recipient.id));
      throw wrongPassword();
    }

    if (recipient.failedPasswordAttempts > 0) {
      await this.db
        .update(recipients)
        .set({ failedPasswordAttempts: 0 })
        .where(eq(recipients.id, recipient.id));
    }
    return { ticket: this.ticket(token) };
  }

  /* -------------------------------------------------------------- submit -- */

  async submit(
    token: string,
    ticket: string | undefined,
    body: SubmitSigningBody,
    ip: string | null,
    userAgent: string | null,
  ): Promise<SubmitSigningResponse> {
    const { recipient, request, locked } = await this.load(token, ticket);
    if (locked || recipient.status === 'signed') notValid();

    const png = decodeSignaturePng(body.signature.image);
    if (!png) notValid();

    // The signing date is the server clock, never the client's. Every other
    // value must be a field of this send and pass its rule; the signing app
    // enforces the same rules as the person types, so a refusal here means
    // the browser was bypassed — hence the uniform 404, not a message.
    const now = new Date();
    const resolved = resolveFieldValues(request.fields, body.fieldValues, {
      signedAt: now,
    });
    if (resolved.missingRequired.length > 0 || resolved.invalid.length > 0) {
      notValid();
    }

    // The claim: the WHERE is the check, so a double click signs once.
    const signatureImageKey = `signatures/${request.id}/${recipient.id}.png`;
    const [claimed] = await this.db
      .update(recipients)
      .set({
        status: 'signed',
        signedAt: now,
        consentAt: now,
        viewedAt: recipient.viewedAt ?? now,
        signerName: body.signerName,
        signatureMethod: body.signature.method,
        signatureImageKey,
        fieldValues: resolved.values,
        signerIp: ip,
        signerUserAgent: userAgent,
      })
      .where(
        and(eq(recipients.id, recipient.id), ne(recipients.status, 'signed')),
      )
      .returning({ id: recipients.id });
    if (!claimed) notValid();

    // Bytes after the claim, so only the winning click's image is kept. If the
    // write fails, give the row back so the person can try again.
    try {
      await this.storage.put(signatureImageKey, png, 'image/png');
    } catch (err) {
      await this.db
        .update(recipients)
        .set({
          status: recipient.status,
          signedAt: null,
          consentAt: null,
          signatureImageKey: null,
          fieldValues: {},
        })
        .where(eq(recipients.id, recipient.id));
      throw err;
    }

    // TODO(phase 07): enqueue `complete-submission` (stamp → seal → certificate).
    this.logger.log(
      `recipient ${recipient.id} signed request ${request.id}; completion job not built yet`,
    );
    return { ok: true };
  }

  /* -------------------------------------------------------- completion -- */

  async status(token: string, ticket?: string): Promise<SigningStatus> {
    const { recipient, locked } = await this.load(token, ticket);
    if (locked) notValid();
    return { ready: isReady(recipient) };
  }

  /** This person's sealed copy or certificate, once ready. */
  async file(
    token: string,
    ticket: string | undefined,
    kind: 'signed' | 'certificate',
  ): Promise<{ bytes: Uint8Array; fileName: string }> {
    const { recipient, request, locked } = await this.load(token, ticket);
    if (locked || !isReady(recipient)) notValid();
    const key =
      kind === 'signed' ? recipient.signedPdfKey! : recipient.certificateKey!;
    const suffix = kind === 'certificate' ? ' — sertifikat' : '';
    return {
      bytes: await this.storage.get(key),
      fileName: `${request.title}${suffix}.pdf`,
    };
  }

  /* ----------------------------------------------------------- open link -- */

  async openLinkInfo(publicToken: string): Promise<OpenLinkInfo> {
    const { request, senderName } = await this.loadOpen(publicToken);
    return {
      title: request.title,
      senderName,
      needsPassword: request.passwordHash !== null,
    };
  }

  /** A new copy for whoever opened the public link. */
  async openLinkStart(
    publicToken: string,
    body: OpenLinkStartBody,
  ): Promise<OpenLinkStartResponse> {
    const { request } = await this.loadOpen(publicToken);
    if (request.passwordHash) {
      // No per-row counter here (no row yet); rate limiting is "Later".
      const ok = await this.passwords.verify(
        request.passwordHash,
        body.password ?? '',
      );
      if (!ok) throw wrongPassword();
    }

    const token = randomBytes(32).toString('base64url');
    await this.db.insert(recipients).values({
      signatureRequestId: request.id,
      fullName: body.name,
      channel: 'link',
      contact: body.phone ? compactPhone(body.phone) : null,
      source: 'open_link',
      token,
    });

    return request.passwordHash
      ? { token, ticket: this.ticket(token) }
      : { token };
  }

  /* -------------------------------------------------------------- helpers -- */

  private ticket(token: string): string {
    return issueTicket(this.env.SIGN_TICKET_SECRET, token);
  }

  /** The row and its send; only a `sent` send works (a draft's links are not live yet). */
  private async load(
    token: string,
    ticket: string | undefined,
  ): Promise<Loaded> {
    if (!TOKEN_SHAPE.test(token)) notValid();
    const [row] = await this.db
      .select({
        recipient: recipients,
        request: signatureRequests,
        senderName: users.fullName,
      })
      .from(recipients)
      .innerJoin(
        signatureRequests,
        eq(signatureRequests.id, recipients.signatureRequestId),
      )
      .innerJoin(users, eq(users.id, signatureRequests.createdByUserId))
      .where(eq(recipients.token, token))
      .limit(1);
    if (!row || row.request.status !== 'sent') notValid();

    const locked =
      row.request.passwordHash !== null &&
      !verifyTicket(this.env.SIGN_TICKET_SECRET, token, ticket);
    return { ...row, locked };
  }

  private async loadOpen(
    publicToken: string,
  ): Promise<{ request: SignatureRequest; senderName: string }> {
    if (!TOKEN_SHAPE.test(publicToken)) notValid();
    const [row] = await this.db
      .select({ request: signatureRequests, senderName: users.fullName })
      .from(signatureRequests)
      .innerJoin(users, eq(users.id, signatureRequests.createdByUserId))
      .where(eq(signatureRequests.publicToken, publicToken))
      .limit(1);
    if (!row || row.request.status !== 'sent' || !row.request.openLinkEnabled) {
      notValid();
    }
    return row;
  }

  /** A link may be opened many times; the first open is what we record. */
  private async markViewed(recipient: Recipient): Promise<void> {
    if (recipient.status !== 'pending') return;
    await this.db
      .update(recipients)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(
        and(eq(recipients.id, recipient.id), eq(recipients.status, 'pending')),
      );
  }
}

function isReady(r: Recipient): boolean {
  return r.signedPdfKey !== null && r.certificateKey !== null;
}

function wrongPassword(): UnauthorizedException {
  return new UnauthorizedException({
    code: SIGNING_ERROR_CODES.wrongPassword,
    message: 'Parol notoğri',
  });
}

function locked(): HttpException {
  return new HttpException(
    {
      code: SIGNING_ERROR_CODES.locked,
      message: 'Juda köp uriniş — yuboruvçiga murojaat qiling',
    },
    HttpStatus.LOCKED,
  );
}
