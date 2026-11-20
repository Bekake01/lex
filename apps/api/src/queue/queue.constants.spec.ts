import { describe, expect, it } from 'vitest';
import {
  jobIdForAnalyze,
  jobIdForInvite,
  jobIdForRevise,
  jobIdForSummarize,
} from './queue.constants.js';

const ID = '01a1fa92-f9e2-7957-ba3e-a589828e5657';
const OTHER = '01a1fa92-fa3c-7739-9e74-7a8bfce3f214';

/**
 * These ids are what makes enqueueing idempotent, so they have to be ids
 * BullMQ accepts. It builds its Redis keys around `:` and rejects a custom job
 * id containing one — which is a 500 at enqueue time, not a warning, and no
 * test with a fake queue can catch it.
 */
describe('job ids', () => {
  const all = [
    jobIdForAnalyze(ID),
    jobIdForRevise(ID, OTHER),
    jobIdForSummarize(ID),
    jobIdForInvite(ID),
  ];

  it.each(all)('%s contains no colon', (jobId) => {
    expect(jobId).not.toContain(':');
  });

  it('is one id per piece of work', () => {
    expect(new Set(all).size).toBe(all.length);
    // The same work asked for twice gets the same id, which is the point.
    expect(jobIdForAnalyze(ID)).toBe(jobIdForAnalyze(ID));
    expect(jobIdForRevise(ID, OTHER)).not.toBe(jobIdForRevise(ID, ID));
  });
});
