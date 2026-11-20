import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RecipientSummaryWire } from '@lex/contracts';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import {
  recipientSummaries,
  recipients,
  signatureRequests,
} from '../db/schema/index.js';
import { toRecipientSummaryWire } from '../ai-review/mappers.js';

/**
 * One 404 for every reason a token does not work — unknown, already signed,
 * cancelled, no summary stored. A caller holding a wrong token learns nothing
 * about which of those it is.
 */
export function notValid(): never {
  throw new NotFoundException('Not found');
}

/**
 * The public signing slice.
 *
 * It reads stored rows and nothing else: no model call is reachable from a
 * signing link, so a recipient's page cannot be made to spend tokens and can
 * only ever show the text that was snapshotted at send time.
 */
@Injectable()
export class SigningService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summaryForToken(token: string): Promise<RecipientSummaryWire> {
    if (!token || token.length < 16) notValid();

    const [row] = await this.db
      .select({
        recipientId: recipients.id,
        recipientStatus: recipients.status,
        requestStatus: signatureRequests.status,
        summary: recipientSummaries,
      })
      .from(recipients)
      .innerJoin(
        signatureRequests,
        eq(signatureRequests.id, recipients.signatureRequestId),
      )
      .leftJoin(
        recipientSummaries,
        eq(
          recipientSummaries.signatureRequestId,
          recipients.signatureRequestId,
        ),
      )
      .where(eq(recipients.token, token))
      .limit(1);

    if (!row) notValid();
    // The link closes once the signature is done, and a cancelled request is
    // not signable either.
    if (row.recipientStatus === 'signed') notValid();
    if (row.requestStatus === 'cancelled') notValid();
    if (!row.summary) notValid();

    // A link may be opened many times; the first open is what we record.
    if (row.recipientStatus === 'pending') {
      await this.db
        .update(recipients)
        .set({ status: 'viewed', viewedAt: new Date() })
        .where(eq(recipients.id, row.recipientId));
    }

    return toRecipientSummaryWire(row.summary);
  }
}
