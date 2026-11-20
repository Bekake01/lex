import { eq } from 'drizzle-orm';
import type { Db } from '../../db/db.module.js';
import { lawActs, lawArticles, type NewLawArticle } from '../../db/schema/index.js';
import { chunkArticle } from '../ingest/chunk.js';
import { searchText, uniqueId } from '../ingest/hf-rows.js';
import { countTokens } from '../text/index.js';
import type { CoreAct } from './core-acts.js';
import { LexUzFetcher } from './fetcher.js';
import { parseLexUzAct, type ParsedAct } from './parser.js';

export interface CoreActResult {
  docId: string;
  name: string;
  outcome: 'inserted' | 'updated' | 'unchanged' | 'failed';
  status?: ParsedAct['status'];
  versionDate?: string | null;
  articles?: number;
  rows?: number;
  /** Rows whose embedding was kept because their text did not change. */
  keptEmbeddings?: number;
  error?: string;
}

/** The rows to store for a parsed act: one per article, long ones split into parts. */
export function rowsFor(docId: string, parsed: ParsedAct): NewLawArticle[] {
  const seen = new Map<string, number>();
  return parsed.articles.flatMap((a) => {
    const base = a.number ? `${docId}-a${a.number}` : `${docId}-full`;
    const text = a.text || a.title || '';
    return chunkArticle({
      id: uniqueId(seen, base),
      docId,
      articleNumber: a.number,
      part: a.part,
      chapter: a.chapter,
      title: a.title,
      text,
      textNorm: searchText(a.title, text),
      chunkIndex: 0,
      nTokens: countTokens(text),
      qualityFlag: a.number ? null : 'no-articles',
      language: 'uz-latn',
    });
  });
}

/**
 * Imports the core acts from lex.uz (Phase 9): each act's current edition
 * replaces whatever the database had for it (the Hugging Face snapshot),
 * with `source = 'lexuz'`, `core = true` and the status lex.uz shows
 * (`status_checked = true`: it comes from the official page itself).
 * Re-running is cheap: unchanged acts are skipped, and rows whose text did
 * not change keep their embeddings. New or changed rows need `pnpm ingest:embed`.
 */
export async function importCoreActs(
  db: Db,
  fetcher: LexUzFetcher,
  acts: CoreAct[],
  onProgress?: (result: CoreActResult) => void,
): Promise<CoreActResult[]> {
  const results: CoreActResult[] = [];
  for (const act of acts) {
    let result: CoreActResult;
    try {
      const parsed = parseLexUzAct(await fetcher.page(act.docId));
      if (parsed.articles.length === 0) throw new Error('no text found on the page (layout changed, or an empty act)');
      result = await save(db, act, parsed);
    } catch (error) {
      const message = (error as Error).message;
      // The fetcher stops the whole run when lex.uz keeps failing.
      if (message.includes('stopping')) throw error;
      result = { docId: act.docId, name: act.name, outcome: 'failed', error: message };
    }
    results.push(result);
    onProgress?.(result);
  }
  return results;
}

async function save(db: Db, act: CoreAct, parsed: ParsedAct): Promise<CoreActResult> {
  const rows = rowsFor(act.docId, parsed);
  const [existing] = await db.select().from(lawActs).where(eq(lawActs.docId, act.docId));
  const previous = await db
    .select({ id: lawArticles.id, textNorm: lawArticles.textNorm, embedding: lawArticles.embedding })
    .from(lawArticles)
    .where(eq(lawArticles.docId, act.docId));

  const sameRows =
    previous.length === rows.length && rows.every((r) => previous.some((p) => p.id === r.id && p.textNorm === r.textNorm));
  const base = { docId: act.docId, name: act.name, status: parsed.status, versionDate: parsed.versionDate, articles: parsed.articles.length, rows: rows.length };
  if (
    existing?.source === 'lexuz' &&
    existing.versionDate === parsed.versionDate &&
    existing.status === parsed.status &&
    existing.title === parsed.title &&
    sameRows
  ) {
    return { ...base, outcome: 'unchanged', keptEmbeddings: previous.filter((p) => p.embedding).length };
  }

  // Keep the embedding of any row whose text is unchanged (re-embedding costs money).
  const kept = new Map(previous.filter((p) => p.embedding).map((p) => [`${p.id}\u0000${p.textNorm}`, p.embedding]));
  let keptEmbeddings = 0;
  const withEmbeddings = rows.map((r) => {
    const embedding = kept.get(`${r.id}\u0000${r.textNorm}`) ?? null;
    if (embedding) keptEmbeddings++;
    return { ...r, embedding };
  });

  const values = {
    docId: act.docId,
    actGroupId: act.docId.replace(/^-/, ''),
    title: parsed.title || act.name,
    actType: parsed.actType,
    docNumber: parsed.docNumber,
    docDate: parsed.docDate,
    versionDate: parsed.versionDate,
    status: parsed.status,
    statusChecked: true,
    core: true,
    language: 'uz-latn',
    sourceUrl: LexUzFetcher.url(act.docId),
    source: 'lexuz' as const,
  };
  await db.transaction(async (tx) => {
    await tx.insert(lawActs).values(values).onConflictDoUpdate({ target: lawActs.docId, set: values });
    await tx.delete(lawArticles).where(eq(lawArticles.docId, act.docId));
    for (let i = 0; i < withEmbeddings.length; i += 1000) {
      await tx.insert(lawArticles).values(withEmbeddings.slice(i, i + 1000));
    }
  });
  return { ...base, outcome: existing ? 'updated' : 'inserted', keptEmbeddings };
}
