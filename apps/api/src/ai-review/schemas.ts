import { z } from 'zod';

/**
 * Schemas for the model's structured output (OpenAI, strict JSON Schema).
 *
 * Structured outputs want every property present, so "absent" is modelled with
 * `.nullable()` rather than `.optional()`. These are the model's shapes, not
 * wire shapes: mappers in `mappers.ts` turn them into `@lex/contracts` types
 * field by field, which is what keeps raw model output out of responses.
 */

const partySchema = z.object({
  name: z
    .string()
    .describe('The party name exactly as written in the document'),
  role: z
    .enum([
      'landlord',
      'tenant',
      'employer',
      'employee',
      'seller',
      'buyer',
      'provider',
      'client',
      'discloser',
      'recipient',
      'other',
    ])
    .describe('The role this party has in this contract'),
});

/** Call 1: cheap pass that decides what the document is and what to retrieve. */
export const classifyOutputSchema = z.object({
  docType: z.enum(['rental', 'employment', 'sale', 'services', 'nda', 'other']),
  documentLanguage: z.enum(['uz-latn', 'uz-cyrl', 'ru', 'en', 'mixed']),
  parties: z.array(partySchema).max(10),
  searchQueries: z
    .array(z.string().min(3).max(120))
    .min(3)
    .max(15)
    .describe(
      'Uzbek Latin search queries for the legislation index: the legal topics ' +
        'this document raises, not sentences copied from it',
    ),
});
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;

const issueSchema = z.object({
  clauseRef: z
    .string()
    .describe('Clause number or heading the problem is in, e.g. "4.2"'),
  quote: z
    .string()
    .max(600)
    .describe('The exact wording from the document that creates the problem'),
  problem: z.string().describe('What is wrong, in one or two sentences'),
  severity: z.enum(['low', 'medium', 'high']),
  recommendation: z.string().describe('What to change, concretely'),
  articleId: z
    .string()
    .nullable()
    .describe(
      'articleId of the retrieved article that supports this finding, copied ' +
        'exactly. null when no retrieved article supports it',
    ),
});

/** Call 2: the review itself, grounded in the retrieved articles. */
export const reviewOutputSchema = z.object({
  riskLevel: z.enum(['low', 'medium', 'high']),
  verdict: z.enum(['acceptable', 'needs_changes', 'not_acceptable']),
  summary: z
    .string()
    .describe('Plain-language overview of the contract and its main risks'),
  issues: z.array(issueSchema).max(40),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

const editSchema = z.object({
  clauseRef: z.string(),
  original: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      'Text copied character for character from the document, long enough to ' +
        'appear exactly once in it',
    ),
  replacement: z.string().max(4000).describe('The text that replaces it'),
  reason: z.string().describe('Why this change, in one or two sentences'),
  articleId: z
    .string()
    .nullable()
    .describe('articleId supporting the change, or null'),
});

/** The correction chat: a reply plus the edits it proposes. */
export const reviseOutputSchema = z.object({
  reply: z
    .string()
    .describe('Short answer to the sender, in the requested language'),
  edits: z.array(editSchema).max(20),
});
export type ReviseOutput = z.infer<typeof reviseOutputSchema>;

const obligationSchema = z.object({
  text: z.string().describe('One obligation in plain language'),
  deadline: z.string().nullable().describe('When it must be done, or null'),
  penalty: z
    .string()
    .nullable()
    .describe('What happens if it is not done, or null'),
  clauseRef: z.string().describe('Clause this obligation comes from'),
});

const summaryPointSchema = z.object({
  text: z.string().describe('One point in plain language'),
  clauseRef: z
    .string()
    .describe('Clause it comes from, or "" when the document says nothing'),
});

/** One recipient's summary, generated at send time. */
export const summaryOutputSchema = z.object({
  overview: z
    .string()
    .describe('What this contract is, in two or three sentences'),
  yourObligations: z.array(obligationSchema).max(20),
  otherObligations: z.array(obligationSchema).max(20),
  keyConditions: z
    .array(
      z.object({
        label: z.string().describe('e.g. price, term, notice period'),
        value: z.string(),
      }),
    )
    .max(15),
  youGet: z
    .array(summaryPointSchema)
    .max(10)
    .describe('What the named party receives'),
  youGive: z
    .array(summaryPointSchema)
    .max(10)
    .describe('What the named party pays, hands over or gives up'),
  deadlines: z
    .array(
      z.object({
        when: z.string().describe('The date, period or recurring time'),
        what: z.string().describe('What must happen by then'),
        who: z.enum(['you', 'other', 'both']),
        clauseRef: z.string(),
      }),
    )
    .max(20)
    .describe('Every date and time limit, in time order'),
  watchOut: z
    .array(
      z.object({
        text: z.string().describe('What can happen to the named party'),
        severity: z.enum(['low', 'medium', 'high']),
        clauseRef: z.string(),
      }),
    )
    .max(10)
    .describe('Terms that can hurt the named party, most serious first'),
  howToEnd: z
    .array(summaryPointSchema)
    .max(6)
    .describe('How either side can end the contract early, notice and cost'),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;
