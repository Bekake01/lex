import type { Job, Queue } from 'bullmq';
import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiService, StructuredCall } from '../src/ai-review/ai.service.js';
import { emptyUsage } from '../src/ai-review/ai.service.js';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Db } from '../src/db/db.module.js';
import { aiUsage, legalChatMessages } from '../src/db/schema/index.js';
import { FakeLawSearchService } from '../src/law-search/fake-law-search.service.js';
import { AnswerQuestionProcessor } from '../src/legal-qa/answer-question.processor.js';
import { chatTitle, LegalQaService } from '../src/legal-qa/legal-qa.service.js';
import type { AnswerQuestionJob } from '../src/queue/queue.constants.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const QUESTION =
  'Ish beruvchi ikki oydan beri ish haqini bermayapti, nima qilay?';

/** Records every call; answers the plan and the answer call with canned output. */
function stubAi(calls: StructuredCall<unknown>[], articleId = 'fx-labor-a72') {
  return {
    model: 'gpt-5',
    promptVersion: 'test',
    configured: true,
    structured: async <T>(call: StructuredCall<T>) => {
      calls.push(call as StructuredCall<unknown>);
      const output =
        call.label === 'qa-plan'
          ? { language: 'uz', searchQueries: ['mehnat shartnomasi ish haqi'] }
          : {
              topic: 'Ish haqi kechiktirilgan',
              urgent: null,
              summary: 'Ish beruvchi ish haqini o‘z vaqtida to‘lashi shart.',
              consequences: [
                {
                  title: 'Shartnoma shartlari',
                  text: 'Xodim ahvolini yomonlashtiruvchi shartlar haqiqiy emas.',
                  articleId,
                },
                {
                  title: 'Ixtiyoriy',
                  text: 'Ismi oʻylab topilgan modda.',
                  articleId: 'made-up-article',
                },
              ],
              steps: ['Yozma talabnoma bering'],
              contacts: [
                {
                  kind: 'gov',
                  name: 'Davlat mehnat inspeksiyasi',
                  detail: 'Bepul tekshiruv',
                  phone: null,
                },
              ],
              template: null,
              followUps: ['Sudga qanday murojaat qilaman?'],
              suggestContractReview: false,
            };
      return {
        output: output as T,
        usage: {
          ...emptyUsage(),
          inputTokens: 300,
          outputTokens: 80,
          costUsd: 0.002,
        },
        model: 'gpt-5-mini',
      };
    },
  } as unknown as AiService;
}

describe('legal Q&A (/ask)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let user: CurrentUser;
  let queued: AnswerQuestionJob[];
  let service: LegalQaService;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    user = await seedUser(db);
    queued = [];
    const queue = {
      add: async (_name: string, data: AnswerQuestionJob) => {
        queued.push(data);
        return {};
      },
    } as unknown as Queue;
    service = new LegalQaService(db, queue);
  });

  const processor = (calls: StructuredCall<unknown>[] = []) =>
    new AnswerQuestionProcessor(
      db,
      new FakeLawSearchService(),
      stubAi(calls),
      new AiUsageService(db),
    );

  const job = (data: AnswerQuestionJob) =>
    ({
      data,
      attemptsMade: 0,
      opts: { attempts: 3 },
    }) as Job<AnswerQuestionJob>;

  it('stores the question with a pending answer and enqueues one job', async () => {
    const { chatId, messageId } = await service.start(user, QUESTION);

    const chat = await service.get(user, chatId);
    expect(chat.title).toBe(chatTitle(QUESTION));
    expect(chat.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'done'],
      ['assistant', 'pending'],
    ]);
    expect(chat.messages[1].id).toBe(messageId);
    expect(queued).toHaveLength(1);
  });

  it('answers with checked citations and records the cost', async () => {
    const { chatId } = await service.start(user, QUESTION);
    const calls: StructuredCall<unknown>[] = [];
    await processor(calls).process(job(queued[0]));

    expect(calls.map((c) => c.label)).toEqual(['qa-plan', 'qa-answer']);
    expect(calls.every((c) => c.tier === 'light')).toBe(true);

    const [, answer] = (await service.get(user, chatId)).messages;
    expect(answer.status).toBe('done');
    // The retrieved article keeps its citation; the made-up one loses it.
    expect(answer.answer?.consequences[0].citation?.articleNumber).toBe('72');
    expect(answer.answer?.consequences[1].citation).toBeNull();
    expect(answer.answer?.steps).toEqual(['Yozma talabnoma bering']);

    const [usage] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.scopeKey, `user:${user.id}`));
    expect(Number(usage.costUsd)).toBeCloseTo(0.004);
    expect(usage.reviewsUsed).toBe(0);
  });

  it('is idempotent: a re-delivered job does not call the model again', async () => {
    await service.start(user, QUESTION);
    await processor().process(job(queued[0]));
    const calls: StructuredCall<unknown>[] = [];
    await processor(calls).process(job(queued[0]));
    expect(calls).toHaveLength(0);
  });

  it('sends earlier turns as context for a follow-up', async () => {
    const { chatId } = await service.start(user, QUESTION);
    await processor().process(job(queued[0]));
    await service.followUp(user, chatId, 'Sudga qanday murojaat qilaman?');

    const calls: StructuredCall<unknown>[] = [];
    await processor(calls).process(job(queued[1]));
    const text = calls[0].content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n');
    expect(text).toContain('<conversation>');
    expect(text).toContain(QUESTION);

    const chats = await service.list(user);
    expect(chats.map((c) => c.id)).toContain(chatId);
  });

  it('hides another user’s chat', async () => {
    const { chatId } = await service.start(user, QUESTION);
    const other = await seedUser(db);
    await expect(service.get(other, chatId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.followUp(other, chatId, 'Salom'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list(other)).toEqual([]);
  });

  it('marks the answer failed when the model is not configured', async () => {
    await service.start(user, QUESTION);
    const failing = {
      structured: async () => {
        const { AiError, AI_ERROR } =
          await import('../src/ai-review/ai-errors.js');
        throw new AiError(
          'OPENAI_API_KEY is not set',
          AI_ERROR.notConfigured,
          false,
        );
      },
    } as unknown as AiService;
    await new AnswerQuestionProcessor(
      db,
      new FakeLawSearchService(),
      failing,
      new AiUsageService(db),
    ).process(job(queued[0]));

    const [row] = await db
      .select()
      .from(legalChatMessages)
      .where(eq(legalChatMessages.id, queued[0].assistantMessageId));
    expect(row.status).toBe('failed');
    expect(row.error).toBe('OPENAI_API_KEY is not set');
  });

  it('shortens long titles at a word', () => {
    const title = chatTitle('soʻz '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
  });
});
