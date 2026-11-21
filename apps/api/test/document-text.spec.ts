import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documentTextWireSchema } from '@lex/contracts';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { documents } from '../src/db/schema/index.js';
import { DocumentsController } from '../src/documents/documents.controller.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const TEXT = '1. Predmet\nKvartira ijaraga beriladi.\n\n2. Ijara haqi\nOyiga 5 000 000 so‘m.\n';
const SECOND = TEXT.indexOf('2. Ijara haqi');
const CLAUSES = [
  { ref: '1', heading: 'Predmet', text: '', start: 0, end: SECOND },
  { ref: '2', heading: 'Ijara haqi', text: '', start: SECOND, end: TEXT.length },
];

describe('GET /documents/:id/text', () => {
  let db: Db;
  let close: () => Promise<void>;
  let dir: string;
  let service: DocumentsService;
  let controller: DocumentsController;
  let owner: CurrentUser;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    dir = await mkdtemp(join(tmpdir(), 'lex-doc-text-'));
    const storage = new StorageService({ STORAGE_DIR: dir } as Env);
    service = new DocumentsService(db, storage);
    controller = new DocumentsController(service, storage, {} as Env);
    owner = await seedUser(db);
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  async function upload(): Promise<string> {
    const doc = await service.upload(owner, {
      name: 'ijara.txt',
      contentType: 'text/plain',
      bytes: new TextEncoder().encode(TEXT),
    });
    return doc.id;
  }

  it('answers 409 DOCUMENT_NOT_READ before the first review', async () => {
    const id = await upload();
    await expect(controller.text(owner, id)).rejects.toMatchObject({
      status: 409,
      response: { code: 'DOCUMENT_NOT_READ' },
    });
  });

  it('returns the stored text and clause offsets that slice it', async () => {
    const id = await upload();
    await db
      .update(documents)
      .set({ extractedText: TEXT, extractedLanguage: 'uz-latn', extractedClauses: CLAUSES })
      .where(eq(documents.id, id));

    const wire = documentTextWireSchema.parse(await controller.text(owner, id));
    expect(wire).toMatchObject({ documentId: id, text: TEXT, scanned: false, language: 'uz-latn' });
    // No per-clause text on the wire: the offsets index `text`.
    expect(wire.clauses).toEqual([
      { ref: '1', heading: 'Predmet', start: 0, end: SECOND },
      { ref: '2', heading: 'Ijara haqi', start: SECOND, end: TEXT.length },
    ]);
    expect(wire.text.slice(wire.clauses[1].start, wire.clauses[1].end)).toBe(
      '2. Ijara haqi\nOyiga 5 000 000 so‘m.\n',
    );
  });

  it('a scanned PDF has no text or clauses, just the flag', async () => {
    const id = await upload();
    await db.update(documents).set({ scanned: true }).where(eq(documents.id, id));
    expect(await controller.text(owner, id)).toMatchObject({ text: '', clauses: [], scanned: true });
  });

  it("refuses someone else's document like GET /documents/:id does", async () => {
    const id = await upload();
    const stranger = await seedUser(db);
    await expect(
      controller.text({ id: stranger.id, agencyId: null, agencyRole: null }, id),
    ).rejects.toMatchObject({ status: 403 });
  });
});
