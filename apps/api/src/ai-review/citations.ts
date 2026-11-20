import type { CitationSnapshot } from '../db/schema/index.js';
import type {
  LawArticleHit,
  LawSearchService,
} from '../law-search/law-search.types.js';

/** Why a claimed citation was dropped — the label the eval harness reports. */
export type CitationFailure = 'retrieval' | 'model';

export interface CitationCheck {
  /** articleId → snapshot, for the ids that passed. */
  snapshots: Map<string, CitationSnapshot>;
  /**
   * Claimed ids that did not pass, with the reason:
   * - `retrieval`: the article exists in the index but search did not return
   *   it, so this is A's to fix.
   * - `model`: no such article — the model made the id up.
   */
  failures: Map<string, CitationFailure>;
}

export function toSnapshot(hit: LawArticleHit): CitationSnapshot {
  return {
    articleId: hit.articleId,
    actTitle: hit.actTitle,
    articleNumber: hit.articleNumber,
    sourceUrl: hit.sourceUrl,
    versionDate: hit.versionDate,
  };
}

/**
 * The server, not the model, decides what a review is allowed to cite.
 *
 * A citation survives only when its articleId is in the set that was actually
 * retrieved for this review. Anything else becomes `citation: null`, and the
 * finding keeps its text — "no supporting norm found" is a legitimate result.
 *
 * Ids that were not retrieved are looked up once through `getArticles` purely
 * to label the failure, so retrieval gaps can be sent to the law-data track
 * instead of being blamed on the prompt.
 */
export async function checkCitations(
  lawSearch: LawSearchService,
  retrieved: LawArticleHit[],
  claimedIds: (string | null | undefined)[],
): Promise<CitationCheck> {
  const retrievedById = new Map(retrieved.map((hit) => [hit.articleId, hit]));
  const snapshots = new Map<string, CitationSnapshot>();
  const failures = new Map<string, CitationFailure>();

  const unknown = new Set<string>();
  for (const id of claimedIds) {
    if (!id) continue;
    const hit = retrievedById.get(id);
    if (hit) snapshots.set(id, toSnapshot(hit));
    else unknown.add(id);
  }

  if (unknown.size > 0) {
    const existing = await lawSearch
      .getArticles([...unknown])
      .catch(() => [] as LawArticleHit[]);
    const existingIds = new Set(existing.map((a) => a.articleId));
    for (const id of unknown) {
      failures.set(id, existingIds.has(id) ? 'retrieval' : 'model');
    }
  }

  return { snapshots, failures };
}
