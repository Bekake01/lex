import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AiReviewModule } from './ai-review/ai-review.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health/health.controller.js';
import { LawModule } from './law/law.module.js';
import { LawSearchModule } from './law-search/law-search.module.js';
import { LegalQaModule } from './legal-qa/legal-qa.module.js';
import { MailModule } from './mail/mail.module.js';
import { MeController } from './me/me.controller.js';
import { QueueModule } from './queue/queue.module.js';
import { SignatureRequestsModule } from './signature-requests/signature-requests.module.js';
import { SigningModule } from './signing/signing.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AiUsageModule } from './usage/ai-usage.module.js';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    AuthModule,
    LawModule,
    StorageModule,
    QueueModule,
    MailModule,
    // LawModule search for the AI review, or the fixtures on an empty index.
    LawSearchModule,
    DocumentsModule,
    AiReviewModule,
    LegalQaModule,
    SignatureRequestsModule,
    SigningModule,
    AiUsageModule,
    BillingModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
          // Secrets and payloads never reach a log line: request bodies carry
          // contract text, and the headers carry keys and signing tokens.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'req.body',
              'res.body',
            ],
            censor: '[redacted]',
          },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [HealthController, MeController],
})
export class AppModule {}
