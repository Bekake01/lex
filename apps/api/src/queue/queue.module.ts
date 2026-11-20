import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ENV, type Env } from '../config/env.js';
import { QUEUE } from './queue.constants.js';

/**
 * All AI work runs as a BullMQ job: nothing heavy on the request path. The
 * workers run in this same process for the hackathon — moving them to a
 * separate `worker.ts` later needs no change to the jobs themselves.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL },
        defaultJobOptions: {
          // Rate limits and overloaded errors are retryable; the processors
          // fail fast on anything else.
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 24 * 3600, count: 500 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE.analyzeDocument },
      { name: QUEUE.reviseDocument },
      { name: QUEUE.summarizeForRecipients },
      { name: QUEUE.sendSigningInvite },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
