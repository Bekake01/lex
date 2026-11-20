import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiService,
  type AiContentBlock,
  addUsage,
  emptyUsage,
} from '../../src/ai-review/ai.service.js';
import { checkCitations } from '../../src/ai-review/citations.js';
import {
  articlesBlockText,
  CLASSIFY_SYSTEM,
  documentBlockText,
  languageInstruction,
  reviewSystem,
} from '../../src/ai-review/prompts.js';
import {
  classifyOutputSchema,
  reviewOutputSchema,
} from '../../src/ai-review/schemas.js';
import { parseEnv } from '../../src/config/env.js';
import type { Db } from '../../src/db/db.module.js';
import { FakeLawSearchService } from '../../src/law-search/fake-law-search.service.js';
import type { LawSearchService } from '../../src/law-search/law-search.types.js';
import type { CaseResult, EvalCase } from './types.js';

/**
 * Review quality harness.
 *
 * Runs the real pipeline (classify → retrieve → review → citation check) over
 * the committed cases and reports the two numbers the review has to hit:
 *
 *   citation accuracy ≥ 95%   — share of claimed citations that survive the
 *                               check, i.e. were really retrieved
 *   issue precision   ≥ 80%   — share of reported issues a lawyer marked
 *
 * Every dropped citation is labelled `retrieval` (the article exists but
 * search missed it — the law track's to fix) or `model` (no such article).
 *
 *   pnpm --filter api eval:review              all cases
 *   pnpm --filter api eval:review rental-01    one case
 *
 * This spends real tokens: one classify + one review call per case.
 */

const here = dirname(fileURLToPath(import.meta.url));
// Compiled to dist-tools/eval/ai-review/run.js, so the cases live next to the
// source, not next to the output.
const casesDir = existsSync(join(here, 'cases'))
  ? join(here, 'cases')
  : join(here, '../../../eval/ai-review/cases');

function loadCases(filter?: string): EvalCase[] {
  return readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as EvalCase)
    .filter((c) => !filter || c.id === filter)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normaliseRef(ref: string): string {
  return ref
    .replace(/[^\w.]/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

/** A reported issue matches an expected one by clause and by wording. */
function matches(
  reported: {
    clauseRef: string;
    problem: string;
    quote: string;
    recommendation: string;
  },
  expected: { clauseRef: string; anyOf: string[] },
): boolean {
  if (normaliseRef(reported.clauseRef) !== normaliseRef(expected.clauseRef)) {
    return false;
  }
  const haystack = [reported.problem, reported.quote, reported.recommendation]
    .join(' ')
    .toLowerCase();
  return expected.anyOf.some((needle) =>
    haystack.includes(needle.toLowerCase()),
  );
}

async function runCase(
  evalCase: EvalCase,
  ai: AiService,
  lawSearch: LawSearchService,
): Promise<CaseResult> {
  const base: CaseResult = {
    id: evalCase.id,
    docType: evalCase.docType,
    classifiedAs: evalCase.docType,
    retrieved: 0,
    reportedIssues: 0,
    matchedExpected: 0,
    expectedIssues: evalCase.expectedIssues.length,
    citationsClaimed: 0,
    citationsKept: 0,
    retrievalFailures: [],
    modelFailures: [],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };

  try {
    const documentBlocks: AiContentBlock[] = [
      { type: 'text', text: documentBlockText(evalCase.text) },
    ];

    const classify = await ai.structured({
      label: `classify:${evalCase.id}`,
      system: CLASSIFY_SYSTEM,
      content: documentBlocks,
      schema: classifyOutputSchema,
      tier: 'light',
      effort: 'medium',
      maxTokens: 8_000,
    });

    const hits = await lawSearch.search({
      queries: classify.output.searchQueries,
      docType: classify.output.docType,
      limit: 30,
    });

    const reviewed = await ai.structured({
      label: `review:${evalCase.id}`,
      system: reviewSystem(classify.output.docType),
      content: [
        { type: 'text', text: languageInstruction(evalCase.language) },
        { type: 'text', text: articlesBlockText(hits) },
        ...documentBlocks,
      ],
      schema: reviewOutputSchema,
    });

    const check = await checkCitations(
      lawSearch,
      hits,
      reviewed.output.issues.map((i) => i.articleId),
    );

    const unmatchedExpected = [...evalCase.expectedIssues];
    let matchedExpected = 0;
    for (const issue of reviewed.output.issues) {
      const index = unmatchedExpected.findIndex((e) => matches(issue, e));
      if (index >= 0) {
        unmatchedExpected.splice(index, 1);
        matchedExpected += 1;
      }
    }

    const claimed = reviewed.output.issues.filter((i) => i.articleId).length;
    const totals = addUsage(
      addUsage(emptyUsage(), classify.usage),
      reviewed.usage,
    );

    return {
      ...base,
      classifiedAs: classify.output.docType,
      retrieved: hits.length,
      reportedIssues: reviewed.output.issues.length,
      matchedExpected,
      citationsClaimed: claimed,
      citationsKept: claimed - check.failures.size,
      retrievalFailures: [...check.failures]
        .filter(([, kind]) => kind === 'retrieval')
        .map(([id]) => id),
      modelFailures: [...check.failures]
        .filter(([, kind]) => kind === 'model')
        .map(([id]) => id),
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      costUsd: totals.costUsd,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** DbLawSearchService over a plain pg pool, without booting Nest. */
async function dbLawSearch(databaseUrl: string): Promise<LawSearchService> {
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../src/db/schema/index.js');
  const { SearchService } =
    await import('../../src/law/search/search.service.js');
  const { DbLawSearchService } =
    await import('../../src/law-search/db-law-search.service.js');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;
  return new DbLawSearchService(new SearchService(db));
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);

  const ai = new AiService(env);
  if (!ai.configured) {
    console.error('OPENAI_API_KEY is not set, so there is nothing to run.');
    process.exit(1);
  }

  // The real law index (LAW_SEARCH_MODE=db) needs Postgres; the default is
  // the fixtures, so the eval runs anywhere.
  const useLex = env.LAW_SEARCH_MODE === 'db';
  const lawSearch: LawSearchService = useLex
    ? await dbLawSearch(env.DATABASE_URL)
    : new FakeLawSearchService();

  const cases = loadCases(process.argv[2]);
  if (cases.length === 0) {
    console.error(`No cases found in ${casesDir}`);
    process.exit(1);
  }

  console.log(
    `Running ${cases.length} case(s) · review on ${env.AI_MODEL}, classify on ` +
      `${env.AI_MODEL_LIGHT} · effort ${env.AI_EFFORT} · prompt ` +
      `${env.AI_PROMPT_VERSION} · law search ${useLex ? 'law tables' : 'fixtures'}\n`,
  );

  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase, ai, lawSearch);
    results.push(result);
    console.log(
      [
        result.id.padEnd(16),
        result.error ? `ERROR ${result.error}` : '',
        `type ${result.classifiedAs}${
          result.classifiedAs === result.docType
            ? ''
            : ` (expected ${result.docType})`
        }`,
        `issues ${result.matchedExpected}/${result.expectedIssues} found, ${result.reportedIssues} reported`,
        `citations ${result.citationsKept}/${result.citationsClaimed}`,
        `$${result.costUsd.toFixed(3)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    for (const id of result.retrievalFailures) {
      console.log(`    retrieval gap: ${id} (send to the law track)`);
    }
    for (const id of result.modelFailures) {
      console.log(`    invented citation: ${id}`);
    }
  }

  const sum = (pick: (r: CaseResult) => number) =>
    results.reduce((total, r) => total + pick(r), 0);

  const claimed = sum((r) => r.citationsClaimed);
  const kept = sum((r) => r.citationsKept);
  const reported = sum((r) => r.reportedIssues);
  const matched = sum((r) => r.matchedExpected);
  const expected = sum((r) => r.expectedIssues);
  const cost = sum((r) => r.costUsd);
  const failed = results.filter((r) => r.error).length;

  console.log('\n--- totals ---');
  console.log(`cases                ${results.length} (${failed} errored)`);
  console.log(`citation accuracy    ${percent(kept, claimed)}  (target ≥ 95%)`);
  console.log(
    `issue precision      ${percent(matched, reported)}  (target ≥ 80%)`,
  );
  console.log(`issue recall         ${percent(matched, expected)}`);
  console.log(
    `retrieval failures   ${sum((r) => r.retrievalFailures.length)} · ` +
      `invented citations ${sum((r) => r.modelFailures.length)}`,
  );
  console.log(
    `cost                 $${cost.toFixed(2)} total, $${(cost / results.length).toFixed(3)} per document`,
  );

  const reportPath = join(process.cwd(), 'eval-report.json');
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: env.AI_MODEL,
        lightModel: env.AI_MODEL_LIGHT,
        effort: env.AI_EFFORT,
        promptVersion: env.AI_PROMPT_VERSION,
        lawSearch: useLex ? 'law tables' : 'fixtures',
        totals: {
          cases: results.length,
          citationAccuracy: claimed === 0 ? null : kept / claimed,
          issuePrecision: reported === 0 ? null : matched / reported,
          issueRecall: expected === 0 ? null : matched / expected,
          costUsd: cost,
        },
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nreport written to ${reportPath}`);

  // Non-zero exit when a target is missed, so this can gate a PR later.
  const belowTarget =
    (claimed > 0 && kept / claimed < 0.95) ||
    (reported > 0 && matched / reported < 0.8);
  process.exit(belowTarget ? 1 : 0);
}

await main();
