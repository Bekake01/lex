import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job, Queue } from 'bullmq';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiService, StructuredCall } from '../src/ai-review/ai.service.js';
import { emptyUsage } from '../src/ai-review/ai.service.js';
import { DocumentContentService } from '../src/ai-review/document-content.service.js';
import { EditsService } from '../src/ai-review/edits.service.js';
import { ReviseDocumentProcessor } from '../src/ai-review/jobs/revise-document.processor.js';
import { ReviewService } from '../src/ai-review/review.service.js';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import {
  aiEdits,
  aiReviewMessages,
  aiReviews,
  documents,
} from '../src/db/schema/index.js';
import {
  DOCX_CONTENT_TYPE,
  DocumentsService,
} from '../src/documents/documents.service.js';
import { FakeLawSearchService } from '../src/law-search/fake-law-search.service.js';
import type {
  ApplyEdit,
  DocProcessingService,
  ExtractedDoc,
} from '../src/law-search/law-search.types.js';
import { EditNotFoundError } from '../src/law-search/law-search.types.js';
import type { ReviseDocumentJob } from '../src/queue/queue.constants.js';
import { StorageService } from '../src/storage/storage.service.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const CONTRACT = `1. Ijara haqi oyiga 5 000 000 so'm.
2. Ijaraga beruvchi ijara haqini istalgan vaqtda oshirishi mumkin.
3. Ijara haqi oyiga 5 000 000 so'm.`;

const UNIQUE = 'istalgan vaqtda oshirishi mumkin';
const REPEATED = "Ijara haqi oyiga 5 000 000 so'm.";

/**
 * Stands in for A's doc-processing over plain text, so the DOCX path can be
 * exercised without a real .docx: extraction decodes, applyEdits replaces.
 */
class TextDocProcessing implements DocProcessingService {
  async extractText(bytes: Uint8Array): Promise<ExtractedDoc> {
    const text = new TextDecoder().decode(bytes);
    return { text, language: 'uz-latn', scanned: false, clauses: [] };
  }

  async applyEdits(bytes: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
    let text = new TextDecoder().decode(bytes);
    edits.forEach((edit, index) => {
      const parts = text.split(edit.original);
      if (parts.length !== 2) throw new EditNotFoundError(index);
      text = parts.join(edit.replacement);
    });
    return new TextEncoder().encode(text);
  }
}

function fakeQueue(): Queue & { added: { id?: string }[] } {
  const added: { id?: string }[] = [];
  return {
    added,
    add: async (_n: string, _d: unknown, opts?: { jobId?: string }) => {
      added.push({ id: opts?.jobId });
      return {} as never;
    },
  } as unknown as Queue & { added: { id?: string }[] };
}

/** The model proposes two edits; only one of them is locatable. */
function stubAi(edits: { original: string; replacement: string }[]) {
  return {
    model: 'gpt-5',
    promptVersion: 'v1',
    configured: true,
    structured: async <T>(_call: StructuredCall<T>) => ({
      output: {
        reply: 'Ijara haqini oshirish tartibini aniqlashtirdim.',
        edits: edits.map((edit) => ({
          clauseRef: '2',
          original: edit.original,
          replacement: edit.replacement,
          reason: 'Bir tomonlama oshirish sharti nomutanosib.',
          articleId: 'fx-civil-a556',
        })),
      } as T,
      usage: {
        ...emptyUsage(),
        inputTokens: 800,
        outputTokens: 150,
        costUsd: 0.006,
      },
      model: 'gpt-5',
    }),
  } as unknown as AiService;
}

describe('corrections', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let storage: StorageService;
  let documentsService: DocumentsService;
  let content: DocumentContentService;
  let usage: AiUsageService;
  let user: CurrentUser;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-revise-'));
    storage = new StorageService({ STORAGE_DIR: dir } as Env);
    documentsService = new DocumentsService(db, storage);
    content = new DocumentContentService(db, new TextDocProcessing(), storage);
    usage = new AiUsageService(db, {
      AI_REVIEWS_LIMIT_PERSONAL: 20,
      AI_REVIEWS_LIMIT_AGENCY: 200,
    } as Env);
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    user = await seedUser(db);
  });

  function reviewService() {
    const analyze = fakeQueue();
    const revise = fakeQueue();
    return {
      analyze,
      revise,
      service: new ReviewService(
        db,
        documentsService,
        usage,
        { model: 'gpt-5', promptVersion: 'v1' } as AiService,
        analyze,
        revise,
      ),
    };
  }

  async function seedFinishedReview(contentType = DOCX_CONTENT_TYPE) {
    const document = await documentsService.upload(user, {
      name: 'ijara.docx',
      contentType,
      bytes: new TextEncoder().encode(CONTRACT),
    });
    const [review] = await db
      .insert(aiReviews)
      .values({
        documentId: document.id,
        requestedByUserId: user.id,
        agencyId: user.agencyId,
        status: 'done',
        language: 'uz',
        docType: 'rental',
        promptVersion: 'v1',
        model: 'gpt-5',
        riskLevel: 'high',
        verdict: 'needs_changes',
        idempotencyKey: `${document.id}:${document.sha256}:v1:uz`,
      })
      .returning();
    return { document, review };
  }

  describe('POST /reviews/:id/messages', () => {
    it('writes both turns and enqueues one revise job', async () => {
      const { review } = await seedFinishedReview();
      const { service, revise } = reviewService();

      const { messageId } = await service.createMessage(
        user,
        review.id,
        '4-bandni tuzating',
      );

      const messages = await db
        .select()
        .from(aiReviewMessages)
        .where(eq(aiReviewMessages.reviewId, review.id))
        .orderBy(asc(aiReviewMessages.createdAt));

      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(messages[1].id).toBe(messageId);
      expect(messages[1].status).toBe('pending');
      expect(revise.added).toHaveLength(1);
      expect(revise.added[0].id).toBe(`revise:${review.id}:${messages[0].id}`);
    });

    it('refuses while the review is still running', async () => {
      const { review } = await seedFinishedReview();
      await db
        .update(aiReviews)
        .set({ status: 'running' })
        .where(eq(aiReviews.id, review.id));

      const { service } = reviewService();
      await expect(
        service.createMessage(user, review.id, 'tuzating'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('revise-document job', () => {
    async function runRevise(
      edits: { original: string; replacement: string }[],
      reviewId: string,
    ) {
      const messages = await db
        .select()
        .from(aiReviewMessages)
        .where(eq(aiReviewMessages.reviewId, reviewId))
        .orderBy(asc(aiReviewMessages.createdAt));

      const worker = new ReviseDocumentProcessor(
        db,
        new FakeLawSearchService(),
        stubAi(edits),
        content,
        usage,
      );
      const data: ReviseDocumentJob = {
        reviewId,
        userMessageId: messages[0].id,
        assistantMessageId: messages[1].id,
      };
      await worker.process({
        data,
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<ReviseDocumentJob>);
      return { worker, data };
    }

    it('keeps an edit whose original appears exactly once', async () => {
      const { review } = await seedFinishedReview();
      const { service } = reviewService();
      await service.createMessage(user, review.id, 'tuzating');

      await runRevise(
        [
          {
            original: UNIQUE,
            replacement:
              'yiliga bir marta, 30 kun oldin ogohlantirib oshirishi mumkin',
          },
        ],
        review.id,
      );

      const wire = await service.listMessages(user, review.id);
      expect(wire[1].status).toBe('done');
      expect(wire[1].text).toContain('tartibini');
      expect(wire[1].edits).toHaveLength(1);
      expect(wire[1].edits[0].status).toBe('proposed');
      expect(wire[1].edits[0].citation?.articleId).toBe('fx-civil-a556');
    });

    it('drops an edit whose original appears twice', async () => {
      const { review } = await seedFinishedReview();
      const { service } = reviewService();
      await service.createMessage(user, review.id, 'tuzating');

      await runRevise(
        [{ original: REPEATED, replacement: 'boshqa' }],
        review.id,
      );

      const wire = await service.listMessages(user, review.id);
      expect(wire[1].status).toBe('done');
      expect(wire[1].edits).toHaveLength(0);
    });

    it('drops an edit whose original is not in the document', async () => {
      const { review } = await seedFinishedReview();
      const { service } = reviewService();
      await service.createMessage(user, review.id, 'tuzating');

      await runRevise(
        [{ original: 'depozit miqdori ikki oylik', replacement: 'bir oylik' }],
        review.id,
      );

      const wire = await service.listMessages(user, review.id);
      expect(wire[1].edits).toHaveLength(0);
    });

    it('is idempotent on re-delivery', async () => {
      const { review } = await seedFinishedReview();
      const { service } = reviewService();
      await service.createMessage(user, review.id, 'tuzating');

      const { worker, data } = await runRevise(
        [{ original: UNIQUE, replacement: 'ogohlantirib oshirishi mumkin' }],
        review.id,
      );
      await worker.process({
        data,
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<ReviseDocumentJob>);

      const edits = await db
        .select()
        .from(aiEdits)
        .where(eq(aiEdits.reviewId, review.id));
      expect(edits).toHaveLength(1);
    });
  });

  describe('POST /reviews/:id/edits/accept', () => {
    function editsService(reviews: ReviewService) {
      return new EditsService(
        db,
        new TextDocProcessing(),
        documentsService,
        reviews,
        storage,
      );
    }

    async function seedProposedEdit(contentType = DOCX_CONTENT_TYPE) {
      const { document, review } = await seedFinishedReview(contentType);
      const { service, analyze } = reviewService();
      await service.createMessage(user, review.id, 'tuzating');
      await runProposal(review.id, document.id);
      const [edit] = await db
        .select()
        .from(aiEdits)
        .where(eq(aiEdits.reviewId, review.id));
      return { document, review, edit, service, analyze };
    }

    async function runProposal(reviewId: string, documentId: string) {
      const messages = await db
        .select()
        .from(aiReviewMessages)
        .where(eq(aiReviewMessages.reviewId, reviewId))
        .orderBy(asc(aiReviewMessages.createdAt));
      await db.insert(aiEdits).values({
        messageId: messages[1].id,
        reviewId,
        documentId,
        clauseRef: '2',
        original: UNIQUE,
        replacement: '30 kun oldin ogohlantirib oshirishi mumkin',
        reason: 'nomutanosib',
        orderIndex: 0,
      });
      await db
        .update(aiReviewMessages)
        .set({ status: 'done', text: 'tayyor' })
        .where(eq(aiReviewMessages.id, messages[1].id));
    }

    it('creates version 2 with new bytes and leaves version 1 untouched', async () => {
      const { document, review, edit, service } = await seedProposedEdit();
      const result = await editsService(service).accept(user, review.id, [
        edit.id,
      ]);

      expect(result.version).toBe(2);

      const [v1] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, document.id));
      const [v2] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, result.documentId));

      expect(v2.parentDocumentId).toBe(document.id);
      expect(v2.rootDocumentId).toBe(document.id);
      expect(v2.sha256).not.toBe(v1.sha256);
      expect(v1.version).toBe(1);

      const v2Text = new TextDecoder().decode(await storage.get(v2.storageKey));
      expect(v2Text).toContain('30 kun oldin ogohlantirib');
      const v1Text = new TextDecoder().decode(await storage.get(v1.storageKey));
      expect(v1Text).toBe(CONTRACT);
    });

    it('enqueues a re-review of the new version', async () => {
      const { review, edit, service, analyze } = await seedProposedEdit();
      const before = analyze.added.length;
      await editsService(service).accept(user, review.id, [edit.id]);
      expect(analyze.added.length).toBe(before + 1);
    });

    it('accepts once when the button is clicked twice', async () => {
      const { review, edit, service } = await seedProposedEdit();
      const edits = editsService(service);

      const first = await edits.accept(user, review.id, [edit.id]);
      const second = await edits.accept(user, review.id, [edit.id]);

      expect(second).toEqual(first);
      const versions = await db
        .select()
        .from(documents)
        .where(eq(documents.rootDocumentId, review.documentId));
      expect(versions.filter((d) => d.version === 2)).toHaveLength(1);
    });

    it('refuses a PDF with 422 and a code the frontend can branch on', async () => {
      const { review, edit, service } =
        await seedProposedEdit('application/pdf');
      await expect(
        editsService(service).accept(user, review.id, [edit.id]),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'EDITS_NEED_DOCX' },
      });
    });

    it('says so plainly while DOCX editing is not built, and keeps the edit', async () => {
      const { review, edit, service } = await seedProposedEdit();
      // What the law track's DocumentProcessingService throws until Phase 13.
      const notBuilt = {
        extractText: (bytes: Uint8Array) =>
          new TextDocProcessing().extractText(bytes),
        applyEdits: () =>
          Promise.reject(new Error('Applying edits to DOCX is not built yet')),
      };

      await expect(
        new EditsService(
          db,
          notBuilt,
          documentsService,
          service,
          storage,
        ).accept(user, review.id, [edit.id]),
      ).rejects.toMatchObject({
        status: 501,
        response: { code: 'EDITS_NOT_AVAILABLE' },
      });

      // The sender can accept it again once the feature lands.
      const [after] = await db
        .select()
        .from(aiEdits)
        .where(eq(aiEdits.id, edit.id));
      expect(after.status).toBe('proposed');
    });

    it('puts the edits back when applying them fails', async () => {
      const { document, review, edit, service } = await seedProposedEdit();
      // The document moved on, so `original` no longer matches.
      await storage.put(
        document.storageKey,
        new TextEncoder().encode('1. Butunlay boshqa matn.'),
      );
      await db
        .update(documents)
        .set({ extractedText: null })
        .where(eq(documents.id, document.id));

      await expect(
        editsService(service).accept(user, review.id, [edit.id]),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'EDIT_NOT_APPLICABLE' },
      });

      const [after] = await db
        .select()
        .from(aiEdits)
        .where(eq(aiEdits.id, edit.id));
      expect(after.status).toBe('proposed');
      expect(after.decidedAt).toBeNull();
    });

    it('lists both versions, oldest first', async () => {
      const { document, review, edit, service } = await seedProposedEdit();
      await editsService(service).accept(user, review.id, [edit.id]);

      const versions = await documentsService.versions(document);
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
      expect(await documentsService.isLatest(versions[0])).toBe(false);
      expect(await documentsService.isLatest(versions[1])).toBe(true);
    });

    it('rejecting an edit leaves the document alone', async () => {
      const { document, review, edit, service } = await seedProposedEdit();
      const result = await editsService(service).reject(user, review.id, [
        edit.id,
      ]);

      expect(result.rejected).toBe(1);
      expect(await documentsService.isLatest(document)).toBe(true);
    });
  });
});
