import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AI_ERROR_CODES, type AcceptEditsResponse } from '@lex/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { DB, type Db } from '../db/db.module.js';
import { aiEdits, documents, type Document } from '../db/schema/index.js';
import {
  DOCX_CONTENT_TYPE,
  DocumentsService,
} from '../documents/documents.service.js';
import {
  DOC_PROCESSING,
  EditNotFoundError,
  type DocProcessingService,
} from '../law-search/law-search.types.js';
import { StorageService } from '../storage/storage.service.js';
import { ReviewService } from './review.service.js';

/**
 * Accepting edits is the only thing that changes a contract, and it never
 * changes one in place: the edits are applied to a copy, which is stored as
 * version + 1 with its own sha256, and the previous version stays untouched as
 * evidence of what was reviewed.
 */
@Injectable()
export class EditsService {
  private readonly logger = new Logger(EditsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DOC_PROCESSING)
    private readonly docProcessing: DocProcessingService,
    private readonly documentsService: DocumentsService,
    private readonly reviews: ReviewService,
    private readonly storage: StorageService,
  ) {}

  async accept(
    user: CurrentUser,
    reviewId: string,
    editIds: string[],
  ): Promise<AcceptEditsResponse> {
    const { review, document } = await this.reviews.reviewForUser(
      user,
      reviewId,
    );

    if (document.contentType !== DOCX_CONTENT_TYPE) {
      throw new UnprocessableEntityException({
        code: AI_ERROR_CODES.editsNeedDocx,
        message: 'Edits can only be applied to DOCX',
      });
    }

    // The status is part of the WHERE, so two clicks cannot both win: the
    // second one updates no rows.
    const claimed = await this.db
      .update(aiEdits)
      .set({ status: 'accepted', decidedAt: new Date() })
      .where(
        and(
          eq(aiEdits.reviewId, review.id),
          eq(aiEdits.status, 'proposed'),
          inArray(aiEdits.id, editIds),
        ),
      )
      .returning();

    if (claimed.length === 0) {
      const existing = await this.childOf(document);
      if (existing) {
        return { documentId: existing.id, version: existing.version };
      }
      throw new ConflictException(
        'Those edits were already decided, or do not belong to this review',
      );
    }

    const ordered = [...claimed].sort((a, b) => a.orderIndex - b.orderIndex);

    let newDocument: Document;
    try {
      const bytes = await this.storage.get(document.storageKey);
      const edited = await this.docProcessing.applyEdits(
        bytes,
        ordered.map((edit) => ({
          original: edit.original,
          replacement: edit.replacement,
        })),
      );
      newDocument = await this.documentsService.createVersion(document, {
        name: document.name,
        contentType: document.contentType,
        bytes: edited,
      });
    } catch (error) {
      // Nothing was written: put the edits back so the sender can retry.
      await this.db
        .update(aiEdits)
        .set({ status: 'proposed', decidedAt: null })
        .where(
          inArray(
            aiEdits.id,
            claimed.map((edit) => edit.id),
          ),
        );

      // Until the law track's Phase 13 lands, `applyEdits` throws. Answering
      // 501 with a code beats a 500 the frontend cannot explain; this branch
      // is dead the day the real implementation arrives.
      if (
        error instanceof Error &&
        error.message.includes('not built yet') &&
        !(error instanceof EditNotFoundError)
      ) {
        throw new NotImplementedException({
          code: AI_ERROR_CODES.editsNotAvailable,
          message:
            'Applying changes to a Word document is not available yet. The suggested wording is still here, and nothing was changed',
        });
      }

      if (error instanceof EditNotFoundError) {
        const edit = ordered[error.index];
        throw new UnprocessableEntityException({
          code: AI_ERROR_CODES.editNotApplicable,
          message:
            'The document changed since this edit was proposed, so it could not be applied',
          editId: edit?.id,
        });
      }
      throw error;
    }

    // Re-review the new version. A used-up quota must not undo the edit, so a
    // 402 here is logged and the new version is still returned.
    try {
      await this.reviews.createReview(user, newDocument.id, review.language);
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.PAYMENT_REQUIRED
      ) {
        this.logger.warn(
          `no quota left to re-review ${newDocument.id} after accepting edits`,
        );
      } else {
        throw error;
      }
    }

    this.logger.log(
      `accepted ${claimed.length} edits on review ${review.id} → document ` +
        `${newDocument.id} v${newDocument.version}`,
    );
    return { documentId: newDocument.id, version: newDocument.version };
  }

  async reject(
    user: CurrentUser,
    reviewId: string,
    editIds: string[],
  ): Promise<{ rejected: number }> {
    const { review } = await this.reviews.reviewForUser(user, reviewId);
    const rows = await this.db
      .update(aiEdits)
      .set({ status: 'rejected', decidedAt: new Date() })
      .where(
        and(
          eq(aiEdits.reviewId, review.id),
          eq(aiEdits.status, 'proposed'),
          inArray(aiEdits.id, editIds),
        ),
      )
      .returning({ id: aiEdits.id });
    return { rejected: rows.length };
  }

  private async childOf(document: Document): Promise<Document | undefined> {
    const [child] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.parentDocumentId, document.id))
      .orderBy(asc(documents.version))
      .limit(1);
    return child;
  }
}
