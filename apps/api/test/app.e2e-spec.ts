import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

process.env.NODE_ENV = 'test';
// /health answers 200 even when Postgres is down (it reports `db: false`).
process.env.DATABASE_URL = 'postgres://lex:lex@localhost:5434/lex';
process.env.JWT_SECRET ??= 'e2e-test-secret-at-least-32-characters-long';
process.env.REDIS_URL ??= 'redis://localhost:6391';

const { AppModule } = await import('../src/app.module.js');

describe('App (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) is public', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it('protected routes need a login', () => {
    return request(app.getHttpServer()).get('/legal-chats').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
