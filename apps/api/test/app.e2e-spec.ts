import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.NODE_ENV = 'test';
// Never connected to: no route in this test touches the database.
process.env.DATABASE_URL = 'postgres://lex:lex@localhost:5434/lex';
process.env.JWT_SECRET ??= 'e2e-test-secret-at-least-32-characters-long';

const { AppModule } = await import('../src/app.module.js');

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
