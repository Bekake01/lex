import type { AiContentBlock } from '../ai.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { asc, eq } from 'drizzle-orm';
import { hashJson } from '../../common/hash.js';
import { DB, type Db } from '../../db/db.module.js';
import {
  documents,
  recipientSummaries,
  recipients,
  signatureRequests,
  type NewRecipientSummary,
  type SummaryBody,
} from '../../db/schema/index.js';
import {
  QUEUE,
  type SummarizeForRecipientsJob,
} from '../../queue/queue.constants.js';
import { AiUsageService } from '../../usage/ai-usage.service.js';
import { toAiError } from '../ai-errors.js';
import { addUsage, AiService, emptyUsage } from '../ai.service.js';
import { DocumentContentService } from '../document-content.service.js';
import { languageInstruction, SUMMARY_SYSTEM } from '../prompts.js';
import { summaryOutputSchema } from '../schemas.js';

/**
 * One summary per contract party, written at send time.
 *
 * This is what makes the signing page possible without AI on the request path:
 * `GET /sign/:token/summary` only reads the rows this job wrote. Recipients who
 * are the same party share one model call.
 */
@Processor(QUEUE.summarizeForRecipients)
export class SummarizeForRecipientsProcessor extends WorkerHost {
  private readonly logger = new Logger(SummarizeForRecipientsProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
    private readonly content: DocumentContentService,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  async process(job: Job<SummarizeForRecipientsJob>): Promise<void> {
    const { signatureRequestId, language } = job.data;

    const [request] = await this.db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, signatureRequestId))
      .limit(1);
    if (!request) return;
    if (request.summariesStatus === 'done') return;

    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, request.documentId))
      .limit(1);
    if (!document) {
      await this.fail(signatureRequestId);
      return;
    }

    const people = await this.db
      .select()
      .from(recipients)
      .where(eq(recipients.signatureRequestId, signatureRequestId))
      .orderBy(asc(recipients.createdAt));
    if (people.length === 0) {
      await this.fail(signatureRequestId);
      return;
    }

    await this.db
      .update(signatureRequests)
      .set({ summariesStatus: 'running' })
      .where(eq(signatureRequests.id, signatureRequestId));

    try {
      const loaded = await this.content.load(document);
      const documentBlocks = this.content.asContentBlocks(document, loaded);

      // One call per distinct party, not per recipient.
      const parties = [
        ...new Set(people.map((p) => p.partyName?.trim() || p.fullName || 'the signer')),
      ];
      const bodies = new Map<string, SummaryBody>();
      let totals = emptyUsage();

      for (const partyName of parties) {
        const content: AiContentBlock[] = [
          { type: 'text', text: languageInstruction(language) },
          {
            type: 'text',
            text: `You are writing for this party of the contract: "${partyName}". Everything that party must do goes in yourObligations; everything the other side must do goes in otherObligations.`,
          },
          ...documentBlocks,
        ];

        const result = await this.ai.structured({
          label: 'summarize',
          system: SUMMARY_SYSTEM,
          content,
          schema: summaryOutputSchema,
          // A summary is explanation, not analysis: it holds up a level down.
          // Plain language from a document already read, so the cheap model.
          tier: 'light',
          effort: 'medium',
          maxTokens: 16_000,
        });

        totals = addUsage(totals, result.usage);
        bodies.set(partyName, {
          overview: result.output.overview,
          yourObligations: result.output.yourObligations.map(toObligation),
          otherObligations: result.output.otherObligations.map(toObligation),
          keyConditions: result.output.keyConditions.map((c) => ({
            label: c.label,
            value: c.value,
          })),
        });
      }

      const rows: NewRecipientSummary[] = people.map((person) => {
        const partyName =
          person.partyName?.trim() || person.fullName || 'the signer';
        const body = bodies.get(partyName)!;
        return {
          signatureRequestId,
          recipientId: person.id,
          partyName,
          language,
          body,
          summaryHash: hashJson(body),
        };
      });

      // One hash over every summary in recipient order: the certificate of
      // completion records it next to the document hash, so it is provable
      // which text each signer was shown.
      const summaryHash = hashJson(
        rows.map((row) => ({
          recipientId: row.recipientId,
          partyName: row.partyName,
          language: row.language,
          summaryHash: row.summaryHash,
        })),
      );

      await this.db.transaction(async (tx) => {
        for (const row of rows) {
          await tx
            .insert(recipientSummaries)
            .values(row)
            // One summary per send (0006). Phase 07 makes this one row.
            .onConflictDoUpdate({
              target: recipientSummaries.signatureRequestId,
              set: {
                recipientId: row.recipientId,
                partyName: row.partyName,
                language: row.language,
                body: row.body,
                summaryHash: row.summaryHash,
              },
            });
        }
        await tx
          .update(signatureRequests)
          .set({ summariesStatus: 'done', summaryHash })
          .where(eq(signatureRequests.id, signatureRequestId));
      });

      await this.usage.recordSummaries(
        { userId: request.createdByUserId, agencyId: request.agencyId },
        totals,
        parties.length,
      );

      this.logger.log(
        `summaries for ${signatureRequestId}: ${parties.length} parties, ` +
          `${rows.length} recipients, hash ${summaryHash.slice(0, 12)}…`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      const attempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      if (aiError.retryable && attempt < maxAttempts) {
        await this.db
          .update(signatureRequests)
          .set({ summariesStatus: 'queued' })
          .where(eq(signatureRequests.id, signatureRequestId));
        throw aiError;
      }

      this.logger.warn(
        `summaries for ${signatureRequestId} failed: ${aiError.code}`,
      );
      await this.fail(signatureRequestId);
    }
  }

  /**
   * A failed summary does not block signing: the invite goes out and the
   * signing page shows the contract without the plain-language summary.
   */
  private async fail(signatureRequestId: string): Promise<void> {
    await this.db
      .update(signatureRequests)
      .set({ summariesStatus: 'failed' })
      .where(eq(signatureRequests.id, signatureRequestId));
  }
}

function toObligation(o: {
  text: string;
  deadline: string | null;
  penalty: string | null;
  clauseRef: string;
}) {
  return {
    text: o.text,
    ...(o.deadline ? { deadline: o.deadline } : {}),
    ...(o.penalty ? { penalty: o.penalty } : {}),
    clauseRef: o.clauseRef,
  };
}
