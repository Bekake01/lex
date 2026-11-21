import { randomBytes } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  Optional,
} from '@nestjs/common';
import { AiUsageService } from '../usage/ai-usage.service.js';
import {
  AI_ERROR_CODES,
  compactPhone,
  SIGNING_ERROR_CODES,
  type AddRecipientsBody,
  type CreateSigningDraftBody,
  type Field,
  type RecipientInput,
  type SendSigningResponse,
  type SigningBox,
  type SigningRecipientWire,
  type SigningRequestDetailWire,
  type SigningRequestList,
  type SigningRequestRow,
  type UpdateSigningAccessBody,
  type UpdateSigningDraftBody,
} from '@lex/contracts';
import type { Queue } from 'bullmq';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { PasswordHasher } from '../auth/password.js';
import type { CurrentUser } from '../common/current-user.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import {
  documents,
  recipients,
  signatureRequests,
  users,
  type NewRecipient,
  type Recipient,
  type SignatureRequest,
} from '../db/schema/index.js';
import { DocumentsService } from '../documents/documents.service.js';
import {
  jobIdForInvite,
  jobIdForSummarize,
  QUEUE,
  type SendSigningInviteJob,
  type SummarizeForRecipientsJob,
} from '../queue/queue.constants.js';
import { readPdfGeometry } from '../signing/pdf-geometry.js';
import { StorageService } from '../storage/storage.service.js';

/**
 * The sender side of signing: one PDF + one field layout → many people, each
 * with their own copy (docs/SIGNING-PLAN.md). Lifecycle `draft → sent →
 * cancelled`. Owner check = `createdByUserId === user.id` (no tenant layer).
 */
@Injectable()
export class SignatureRequestsService {
  private readonly logger = new Logger(SignatureRequestsService.name);
  private readonly passwords = new PasswordHasher();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE.summarizeForRecipients)
    private readonly summarizeQueue: Queue,
    @InjectQueue(QUEUE.sendSigningInvite) private readonly inviteQueue: Queue,
    /** Free-plan send limit. Optional so unit tests can leave it out. */
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  /* ---------------------------------------------------------------- draft -- */

  async createDraft(
    user: CurrentUser,
    body: CreateSigningDraftBody,
  ): Promise<SigningRequestDetailWire> {
    const document = await this.documents.forUser(user, body.documentId);

    // Only the latest version may be sent: an accepted AI edit creates a new
    // version, and sending the old one would send text nobody approved.
    if (!(await this.documents.isLatest(document))) {
      const latest = await this.documents.latestOf(document);
      throw new ConflictException({
        code: AI_ERROR_CODES.notLatestVersion,
        message: 'Only the latest version of a document can be sent',
        latestDocumentId: latest.id,
        latestVersion: latest.version,
      });
    }
    if (document.contentType !== 'application/pdf') {
      throw new UnsupportedMediaTypeException({
        code: SIGNING_ERROR_CODES.pdfOnly,
        message: 'Faqat PDF yuboriş mumkin',
      });
    }

    let geometry: Awaited<ReturnType<typeof readPdfGeometry>>;
    try {
      geometry = await readPdfGeometry(
        await this.storage.get(document.storageKey),
      );
    } catch (err) {
      throw new BadRequestException({
        code: SIGNING_ERROR_CODES.pdfUnreadable,
        message: 'PDF faylni öqib bölmadi',
        reason: (err as Error).message,
      });
    }

    const [request] = await this.db
      .insert(signatureRequests)
      .values({
        documentId: document.id,
        createdByUserId: user.id,
        agencyId: user.agencyId,
        status: 'draft',
        title: document.name.replace(/\.[^.]+$/, '') || document.name,
        documentHash: document.sha256,
        pageCount: geometry.pageCount,
        pageSizes: geometry.pageSizes,
      })
      .returning();

    return this.detailOf(request);
  }

  /** Title, message, party, fields, people — a draft only. */
  async updateDraft(
    user: CurrentUser,
    id: string,
    body: UpdateSigningDraftBody,
  ): Promise<SigningRequestDetailWire> {
    const request = await this.own(user, id);
    assertStatus(request, 'draft');
    if (body.fields) checkFields(body.fields, request.pageCount ?? 0);

    await this.db.transaction(async (tx) => {
      const set: Partial<SignatureRequest> = {};
      if (body.title !== undefined) set.title = body.title;
      if (body.message !== undefined) set.message = body.message || null;
      if (body.partyName !== undefined) set.partyName = body.partyName;
      if (body.fields !== undefined) set.fields = body.fields;
      if (Object.keys(set).length > 0) {
        await tx
          .update(signatureRequests)
          .set(set)
          .where(eq(signatureRequests.id, id));
      }

      if (body.recipients !== undefined) {
        await tx
          .delete(recipients)
          .where(eq(recipients.signatureRequestId, id));
        if (body.recipients.length > 0) {
          await tx
            .insert(recipients)
            .values(body.recipients.map((r) => recipientRow(id, r)));
        }
      }
    });

    return this.detailOf(await this.own(user, id));
  }

  /** Open link and password — a draft or a sent send. */
  async updateAccess(
    user: CurrentUser,
    id: string,
    body: UpdateSigningAccessBody,
  ): Promise<SigningRequestDetailWire> {
    const request = await this.own(user, id);
    if (request.status === 'cancelled') assertStatus(request, 'sent');

    const set: Partial<SignatureRequest> = {};
    if (body.openLinkEnabled !== undefined) {
      set.openLinkEnabled = body.openLinkEnabled;
      // Off kills the old open link; copies already started keep their own token.
      set.publicToken = body.openLinkEnabled
        ? (request.publicToken ?? newToken())
        : null;
    }
    if (body.password !== undefined) {
      set.passwordHash =
        body.password === null
          ? null
          : await this.passwords.hash(body.password);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(signatureRequests)
        .set(set)
        .where(eq(signatureRequests.id, id));
      if (body.password !== undefined) {
        // A new or removed password unlocks every link that was locked out.
        await tx
          .update(recipients)
          .set({ failedPasswordAttempts: 0 })
          .where(eq(recipients.signatureRequestId, id));
      }
    });

    return this.detailOf(await this.own(user, id));
  }

  /* ----------------------------------------------------------------- send -- */

  async send(user: CurrentUser, id: string): Promise<SendSigningResponse> {
    const request = await this.own(user, id);
    assertStatus(request, 'draft');

    if (!request.fields.some((f) => f.type === 'signature')) {
      throw new UnprocessableEntityException({
        code: SIGNING_ERROR_CODES.needsSignatureField,
        message: 'Kamida bitta imzo maydoni qöying',
      });
    }
    const people = await this.recipientsOf(id);
    if (people.length === 0 && !request.openLinkEnabled) {
      throw new UnprocessableEntityException({
        code: SIGNING_ERROR_CODES.needsRecipients,
        message: 'Kamida bitta odam qöşing yoki oçiq havolani yoqing',
      });
    }

    await this.usage?.assertSendAllowed(user);

    // Conditional on `draft`, so a double click sends once.
    const [sent] = await this.db
      .update(signatureRequests)
      .set({ status: 'sent', sentAt: new Date(), summariesStatus: 'queued' })
      .where(
        and(
          eq(signatureRequests.id, id),
          eq(signatureRequests.status, 'draft'),
        ),
      )
      .returning();
    if (!sent) {
      assertStatus(await this.own(user, id), 'draft');
      throw new ConflictException({ code: SIGNING_ERROR_CODES.notDraft });
    }

    const summarizePayload: SummarizeForRecipientsJob = {
      signatureRequestId: id,
      language: sent.summaryLanguage,
    };
    await this.summarizeQueue.add(
      QUEUE.summarizeForRecipients,
      summarizePayload,
      { jobId: jobIdForSummarize(id) },
    );
    const invitePayload: SendSigningInviteJob = {
      signatureRequestId: id,
      summaryDeadline: Date.now() + this.env.SUMMARY_WAIT_MS,
    };
    await this.inviteQueue.add(QUEUE.sendSigningInvite, invitePayload, {
      jobId: jobIdForInvite(id),
    });

    this.logger.log(
      `signature request ${id} sent: ${people.length} people, ` +
        `open link ${sent.openLinkEnabled ? 'on' : 'off'}`,
    );
    return this.sendResponse(sent, people);
  }

  /** More people on a send that is already out. */
  async addRecipients(
    user: CurrentUser,
    id: string,
    body: AddRecipientsBody,
  ): Promise<SendSigningResponse> {
    const request = await this.own(user, id);
    assertStatus(request, 'sent');

    const added = await this.db
      .insert(recipients)
      .values(body.recipients.map((r) => recipientRow(id, r)))
      .returning();

    const invitePayload: SendSigningInviteJob = {
      signatureRequestId: id,
      // The summary is already there (or never will be): don't wait for it.
      summaryDeadline: Date.now(),
      recipientIds: added.map((r) => r.id),
    };
    await this.inviteQueue.add(QUEUE.sendSigningInvite, invitePayload, {
      jobId: jobIdForInvite(id, added[0].id),
    });

    return this.sendResponse(request, added);
  }

  /** Every link and the open link stop working; signed copies stay. */
  async cancel(
    user: CurrentUser,
    id: string,
  ): Promise<SigningRequestDetailWire> {
    const request = await this.own(user, id);
    if (request.status !== 'cancelled') {
      await this.db
        .update(signatureRequests)
        .set({ status: 'cancelled' })
        .where(eq(signatureRequests.id, id));
    }
    return this.detailOf(await this.own(user, id));
  }

  /* ---------------------------------------------------------------- reads -- */

  async detail(
    user: CurrentUser,
    id: string,
  ): Promise<SigningRequestDetailWire> {
    return this.detailOf(await this.own(user, id));
  }

  async list(user: CurrentUser, box: SigningBox): Promise<SigningRequestList> {
    return {
      requests:
        box === 'inbox' ? await this.inbox(user) : await this.sent(user),
    };
  }

  /** A sealed copy or its certificate, for the sender. 404 until it is ready. */
  async download(
    user: CurrentUser,
    id: string,
    recipientId: string,
    kind: 'signed' | 'certificate',
  ): Promise<{ bytes: Uint8Array; fileName: string }> {
    const request = await this.own(user, id);
    const [person] = await this.db
      .select()
      .from(recipients)
      .where(
        and(
          eq(recipients.id, recipientId),
          eq(recipients.signatureRequestId, id),
        ),
      )
      .limit(1);
    const key =
      kind === 'signed' ? person?.signedPdfKey : person?.certificateKey;
    if (!person || !key) throw new NotFoundException('Not ready');

    const who = person.signerName ?? person.fullName ?? 'imzolovçi';
    const suffix = kind === 'certificate' ? ' — sertifikat' : '';
    return {
      bytes: await this.storage.get(key),
      fileName: `${request.title} — ${who}${suffix}.pdf`,
    };
  }

  signUrl(token: string): string {
    return `${this.appUrl()}/sign/${token}`;
  }

  openLinkUrl(publicToken: string): string {
    return `${this.appUrl()}/open/${publicToken}`;
  }

  /* -------------------------------------------------------------- helpers -- */

  private appUrl(): string {
    return this.env.SIGN_APP_URL.replace(/\/+$/, '');
  }

  /** The caller's own send, or 404 (someone else's looks the same as none). */
  private async own(user: CurrentUser, id: string): Promise<SignatureRequest> {
    const [request] = await this.db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, id))
      .limit(1);
    if (!request || request.createdByUserId !== user.id) {
      throw new NotFoundException('Signature request not found');
    }
    return request;
  }

  private recipientsOf(id: string): Promise<Recipient[]> {
    return (
      this.db
        .select()
        .from(recipients)
        .where(eq(recipients.signatureRequestId, id))
        // Newest signed first, then everyone else in the order they were added.
        .orderBy(
          sql`${recipients.signedAt} desc nulls last`,
          asc(recipients.createdAt),
        )
    );
  }

  private async detailOf(
    request: SignatureRequest,
  ): Promise<SigningRequestDetailWire> {
    const [doc] = await this.db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, request.documentId))
      .limit(1);
    const people = await this.recipientsOf(request.id);
    return {
      ...this.rowOf(request, doc?.name ?? '', {
        total: people.length,
        signed: people.filter((p) => p.status === 'signed').length,
      }),
      fields: request.fields,
      pageSizes: request.pageSizes ?? [],
      recipients: people.map((p) => this.recipientWire(p)),
    };
  }

  private rowOf(
    r: SignatureRequest,
    documentName: string,
    counts: { total: number; signed: number },
  ): SigningRequestRow {
    return {
      id: r.id,
      title: r.title,
      documentId: r.documentId,
      documentName,
      // `pending` / `completed` are from the old model and never written now.
      status:
        r.status === 'sent' || r.status === 'cancelled' ? r.status : 'draft',
      message: r.message,
      partyName: r.partyName,
      pageCount: r.pageCount ?? 1,
      openLinkEnabled: r.openLinkEnabled,
      openLinkUrl:
        r.openLinkEnabled && r.publicToken
          ? this.openLinkUrl(r.publicToken)
          : null,
      hasPassword: r.passwordHash !== null,
      recipientCount: counts.total,
      signedCount: counts.signed,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    };
  }

  private recipientWire(p: Recipient): SigningRecipientWire {
    return {
      id: p.id,
      name: p.fullName,
      channel: p.channel,
      contact: p.contact,
      source: p.source,
      status: p.status,
      viewedAt: p.viewedAt?.toISOString() ?? null,
      signedAt: p.signedAt?.toISOString() ?? null,
      signUrl: this.signUrl(p.token),
      ready: p.signedPdfKey !== null && p.certificateKey !== null,
      signerName: p.signerName,
      fieldValues: p.fieldValues,
    };
  }

  private sendResponse(
    request: SignatureRequest,
    people: Recipient[],
  ): SendSigningResponse {
    return {
      id: request.id,
      recipients: people.map((p) => ({
        id: p.id,
        name: p.fullName,
        channel: p.channel,
        contact: p.contact,
        signUrl: this.signUrl(p.token),
      })),
      openLinkUrl:
        request.openLinkEnabled && request.publicToken
          ? this.openLinkUrl(request.publicToken)
          : null,
    };
  }

  /** My sends, newest first, drafts included; counts in one grouped query. */
  private async sent(user: CurrentUser): Promise<SigningRequestRow[]> {
    const rows = await this.db
      .select({ request: signatureRequests, documentName: documents.name })
      .from(signatureRequests)
      .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
      .where(eq(signatureRequests.createdByUserId, user.id))
      .orderBy(desc(signatureRequests.createdAt));
    if (rows.length === 0) return [];

    const counts = await this.db
      .select({
        id: recipients.signatureRequestId,
        total: count(),
        signed:
          sql<number>`count(*) filter (where ${recipients.status} = 'signed')`.mapWith(
            Number,
          ),
      })
      .from(recipients)
      .where(
        inArray(
          recipients.signatureRequestId,
          rows.map((r) => r.request.id),
        ),
      )
      .groupBy(recipients.signatureRequestId);
    const byId = new Map(counts.map((c) => [c.id, c]));

    return rows.map(({ request, documentName }) =>
      this.rowOf(
        request,
        documentName,
        byId.get(request.id) ?? { total: 0, signed: 0 },
      ),
    );
  }

  /**
   * Sends where my email is a recipient ("Imzolaşim kerak"). Each row carries
   * my own copy (status + link); counts and the open link are the sender's
   * business, so here they only describe my copy.
   */
  private async inbox(user: CurrentUser): Promise<SigningRequestRow[]> {
    const [me] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!me) return [];

    const rows = await this.db
      .select({
        request: signatureRequests,
        documentName: documents.name,
        senderName: users.fullName,
        mine: recipients,
      })
      .from(recipients)
      .innerJoin(
        signatureRequests,
        eq(signatureRequests.id, recipients.signatureRequestId),
      )
      .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
      .innerJoin(users, eq(users.id, signatureRequests.createdByUserId))
      .where(
        and(
          eq(recipients.email, me.email),
          eq(signatureRequests.status, 'sent'),
        ),
      )
      .orderBy(desc(signatureRequests.sentAt));

    return rows.map(({ request, documentName, senderName, mine }) => ({
      ...this.rowOf(request, documentName, {
        total: 1,
        signed: mine.status === 'signed' ? 1 : 0,
      }),
      openLinkUrl: null,
      senderName,
      mine: {
        recipientId: mine.id,
        status: mine.status,
        signedAt: mine.signedAt?.toISOString() ?? null,
        signUrl: this.signUrl(mine.token),
      },
    }));
  }
}

/** 32 random bytes: the only secret in a signing link. */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function assertStatus(
  request: SignatureRequest,
  wanted: 'draft' | 'sent',
): void {
  if (request.status === wanted) return;
  if (request.status === 'cancelled') {
    throw new ConflictException({
      code: SIGNING_ERROR_CODES.cancelled,
      message: 'Bu yuboriş bekor qilingan',
    });
  }
  throw new ConflictException(
    wanted === 'draft'
      ? {
          code: SIGNING_ERROR_CODES.notDraft,
          message: 'Yuborilgandan keyin özgartirib bölmaydi',
        }
      : { code: SIGNING_ERROR_CODES.notSent, message: 'Avval yuboring' },
  );
}

/** Pages in range and ids unique; the shape itself was checked by the schema. */
function checkFields(fields: Field[], pageCount: number): void {
  const ids = new Set<string>();
  for (const field of fields) {
    if (field.page > pageCount || ids.has(field.id)) {
      throw new BadRequestException({
        code: SIGNING_ERROR_CODES.badFields,
        message: `Maydon ${field.id}: sahifa yoki id notoğri`,
      });
    }
    ids.add(field.id);
  }
}

/** One person's copy. Contact stored normalized; email also in `email` for the inbox. */
function recipientRow(
  signatureRequestId: string,
  r: RecipientInput,
): NewRecipient {
  const contact = normalizeContact(r);
  return {
    signatureRequestId,
    fullName: r.name ?? null,
    channel: r.channel,
    contact,
    email: r.channel === 'email' ? contact : null,
    source: 'invite',
    token: newToken(),
  };
}

function normalizeContact(r: RecipientInput): string | null {
  const raw = r.contact?.trim() ?? '';
  switch (r.channel) {
    case 'email':
      return raw.toLowerCase();
    case 'sms':
      return compactPhone(raw);
    case 'telegram':
      return raw.startsWith('@') ? raw : compactPhone(raw);
    case 'link':
      return raw || null;
  }
}
