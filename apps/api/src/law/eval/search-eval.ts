import { z } from 'zod';
import { docTypeSchema } from '../search/schemas.js';

/**
 * Search quality evaluation. The query set lives in
 * eval/search/queries.jsonl: one query per line with the article ids a good
 * search must return. Scored at article level: parts of a split article
 * (`{id}-p2`) count as their article.
 */

export const evalQuerySchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  docType: docTypeSchema,
  query: z.string().min(1),
  expected: z.array(z.string().min(1)).min(1),
  note: z.string().optional(),
});
export type EvalQuery = z.infer<typeof evalQuerySchema>;

/** Parses the JSONL query file; errors name the line. */
export function parseQueries(jsonl: string): EvalQuery[] {
  const queries: EvalQuery[] = [];
  jsonl.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`queries line ${i + 1}: not valid JSON`);
    }
    const parsed = evalQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`queries line ${i + 1}: ${issue?.path.join('.')} ${issue?.message}`);
    }
    queries.push(parsed.data);
  });
  const ids = new Set(queries.map((q) => q.id));
  if (ids.size !== queries.length) throw new Error('queries: duplicate ids');
  return queries;
}

/** The article a hit belongs to: `-180552-a551-p2` → `-180552-a551`. */
export function articleOf(hitId: string): string {
  return hitId.replace(/-p\d+$/, '');
}

export interface QueryResult {
  id: string;
  topic: string;
  query: string;
  expected: string[];
  /** Ranked article ids (parts collapsed, duplicates removed). */
  ranked: string[];
  /** 1-based rank of the first expected article, or null if not in the list. */
  firstRank: number | null;
  recall5: number;
  recall10: number;
}

const recallAt = (ranked: string[], expected: Set<string>, k: number) =>
  ranked.slice(0, k).filter((id) => expected.has(id)).length / expected.size;

/** Scores one query from the hit ids search returned, best first. */
export function scoreQuery(q: EvalQuery, hitIds: string[]): QueryResult {
  const ranked = [...new Set(hitIds.map(articleOf))];
  const expected = new Set(q.expected);
  const index = ranked.findIndex((id) => expected.has(id));
  return {
    id: q.id,
    topic: q.topic,
    query: q.query,
    expected: q.expected,
    ranked,
    firstRank: index === -1 ? null : index + 1,
    recall5: recallAt(ranked, expected, 5),
    recall10: recallAt(ranked, expected, 10),
  };
}

export interface Metrics {
  queries: number;
  /** Share of expected articles found in the top 5 / top 10, averaged over queries. */
  recall5: number;
  recall10: number;
  /** Share of queries with at least one expected article in the top 10. */
  hit10: number;
  /** Mean reciprocal rank of the first expected article (0 when missing). */
  mrr: number;
}

export interface EvalSummary extends Metrics {
  byTopic: Record<string, Metrics>;
}

function metrics(results: QueryResult[]): Metrics {
  const n = results.length || 1;
  const sum = (f: (r: QueryResult) => number) => results.reduce((s, r) => s + f(r), 0) / n;
  return {
    queries: results.length,
    recall5: sum((r) => r.recall5),
    recall10: sum((r) => r.recall10),
    hit10: sum((r) => (r.firstRank !== null && r.firstRank <= 10 ? 1 : 0)),
    mrr: sum((r) => (r.firstRank ? 1 / r.firstRank : 0)),
  };
}

export function summarize(results: QueryResult[]): EvalSummary {
  const topics = [...new Set(results.map((r) => r.topic))];
  return {
    ...metrics(results),
    byTopic: Object.fromEntries(topics.map((t) => [t, metrics(results.filter((r) => r.topic === t))])),
  };
}

/** Anything that returns ranked hit ids for a query: keyword, vector or hybrid search. */
export type Retriever = (q: EvalQuery) => Promise<string[]>;

export async function runSearchEval(
  queries: EvalQuery[],
  retrieve: Retriever,
): Promise<{ summary: EvalSummary; results: QueryResult[] }> {
  const results: QueryResult[] = [];
  for (const q of queries) results.push(scoreQuery(q, await retrieve(q)));
  return { summary: summarize(results), results };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

/** A plain-text report: overall, per topic, then the queries that missed. */
export function formatReport(label: string, summary: EvalSummary, results: QueryResult[]): string {
  const row = (name: string, m: Metrics) =>
    `${name.padEnd(16)} ${String(m.queries).padStart(4)}  ${pct(m.recall5)}  ${pct(m.recall10)}  ${pct(m.hit10)}  ${m.mrr.toFixed(3)}`;
  const lines = [
    `Search eval: ${label}`,
    `${'topic'.padEnd(16)} ${'n'.padStart(4)}  ${'R@5'.padStart(6)}  ${'R@10'.padStart(6)}  ${'hit@10'.padStart(6)}  MRR`,
    row('ALL', summary),
    ...Object.entries(summary.byTopic).map(([t, m]) => row(t, m)),
  ];
  const misses = results.filter((r) => r.firstRank === null || r.firstRank > 10);
  if (misses.length > 0) {
    lines.push('', `Missed in top 10 (${misses.length}):`);
    for (const r of misses) {
      lines.push(`  ${r.id}  "${r.query}"  want ${r.expected.join(',')}  got ${r.ranked.slice(0, 3).join(',') || '-'}`);
    }
  }
  return lines.join('\n');
}
