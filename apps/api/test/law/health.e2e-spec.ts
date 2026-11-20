import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Db } from '../../src/db/db.module.js';
import { createTestDb } from '../helpers/test-db.js';

process.env.NODE_ENV = 'test';
// Never connected to: the DB provider is replaced in every test app below.
process.env.DATABASE_URL = 'postgres://lex:lex@localhost:5434/lex';
process.env.JWT_SECRET ??= 'e2e-test-secret-at-least-32-characters-long';
process.env.REDIS_URL ??= 'redis://localhost:6379';

const { AppModule } = await import('../../src/app.module.js');
const { DB } = await import('../../src/db/db.module.js');

async function createApp(db: Db): Promise<INestApplication<Server>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  await app.init();
  return app;
}

describe('GET /health (e2e)', () => {
  let app: INestApplication<Server>;
  let closeDb: () => Promise<void>;
  let db: Db;

  beforeAll(async () => {
    ({ db, close: closeDb } = await createTestDb());
    app = await createApp(db);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('GET /health reports the db on an empty index', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: true, indexVersionDate: null });
  });

  it('GET /health reports the newest loaded law edition', async () => {
    const { lawActs } = await import('../../src/db/schema/index.js');
    await db.insert(lawActs).values([
      { docId: 'a', title: 'A', actType: 'law', versionDate: '2025-03-01', language: 'uz-latn', sourceUrl: 'https://lex.uz/docs/1', source: 'hf' },
      { docId: 'b', title: 'B', actType: 'code', versionDate: '2026-02-10', language: 'uz-latn', sourceUrl: 'https://lex.uz/docs/2', source: 'lexuz' },
    ]);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: true, indexVersionDate: '2026-02-10' });
  });
});

describe('GET /health (e2e) with the database down', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const unreachable = {
      execute: () => Promise.reject(new Error('connect ECONNREFUSED')),
    } as unknown as Db;
    app = await createApp(unreachable);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health stays up and reports db: false', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: false, indexVersionDate: null });
  });
});
