import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Db } from '../src/db/db.module.js';
import { createTestDb } from './helpers/test-db.js';

const KEY = 'e2e-test-key-'.padEnd(40, 'x');

process.env.NODE_ENV = 'test';
process.env.LEX_API_KEY = KEY;
// Never connected to: the DB provider is replaced in every test app below.
process.env.DATABASE_URL = 'postgres://lex:lex@localhost:5433/lex';

const { AppModule } = await import('../src/app.module.js');
const { DB } = await import('../src/db/db.module.js');

// A protected route that exists only in this test, so the guard can be
// exercised before real routes (/search, /meta) arrive in Phase 6.
@Controller('protected-probe')
class ProbeController {
  @Get()
  get() {
    return { reached: true };
  }
}

async function createApp(db: Db): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController],
  })
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

describe('lex-api (e2e)', () => {
  let app: INestApplication<App>;
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

  it('GET /health is public and reports the db on an empty index', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: true, indexVersionDate: null });
  });

  it('GET /health reports the newest loaded law edition', async () => {
    const { lawActs } = await import('../src/db/schema.js');
    await db.insert(lawActs).values([
      { docId: 'a', title: 'A', actType: 'law', versionDate: '2025-03-01', language: 'uz-latn', sourceUrl: 'https://lex.uz/docs/1', source: 'hf' },
      { docId: 'b', title: 'B', actType: 'code', versionDate: '2026-02-10', language: 'uz-latn', sourceUrl: 'https://lex.uz/docs/2', source: 'lexuz' },
    ]);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: true, indexVersionDate: '2026-02-10' });
  });

  it('a protected route without the key → 401', async () => {
    await request(app.getHttpServer()).get('/protected-probe').expect(401);
  });

  it('a protected route with a wrong key → 401', async () => {
    await request(app.getHttpServer())
      .get('/protected-probe')
      .set('x-lex-api-key', 'nope')
      .expect(401);
  });

  it('a protected route with the right key → 200', async () => {
    await request(app.getHttpServer())
      .get('/protected-probe')
      .set('x-lex-api-key', KEY)
      .expect(200, { reached: true });
  });

  it('sends no CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('lex-api (e2e) with the database down', () => {
  let app: INestApplication<App>;

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
