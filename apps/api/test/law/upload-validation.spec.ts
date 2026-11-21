import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { CurrentUser } from '../../src/common/current-user.js';
import type { Env } from '../../src/config/env.js';
import { DocumentsController } from '../../src/documents/documents.controller.js';
import type { DocumentsService } from '../../src/documents/documents.service.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { DOCX, PDF } from '../../src/law/documents/file-type.js';
import { makeDocx, makeExe, makePdf } from '../helpers/doc-fixtures.js';

/** The upload route checks size and real file type before storing anything. */
describe('POST /documents file checks', () => {
  const stored: string[] = [];
  const service = {
    upload: async (_user: unknown, input: { name: string }) => {
      stored.push(input.name);
      return {
        id: 'd1',
        name: input.name,
        contentType: PDF,
        version: 1,
        createdAt: new Date(),
      };
    },
  } as unknown as DocumentsService;
  const controller = new DocumentsController(
    service,
    {} as StorageService,
    { MAX_UPLOAD_BYTES: 1024 * 1024 } as Env,
  );
  const user = { id: 'u1' } as CurrentUser;
  const file = (bytes: Uint8Array, mimetype: string, name = 'contract') => ({
    originalname: name,
    mimetype,
    size: bytes.length,
    buffer: Buffer.from(bytes),
  });

  beforeEach(() => {
    stored.length = 0;
  });

  it('refuses a file over the limit with 413', async () => {
    const big = new Uint8Array(1024 * 1024 + 1).fill(0x41);
    await expect(
      controller.upload(user, file(big, 'text/plain')),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(stored).toEqual([]);
  });

  it('refuses an executable renamed to .pdf with 415', async () => {
    await expect(
      controller.upload(user, file(makeExe(), PDF, 'contract.pdf')),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(stored).toEqual([]);
  });

  it('refuses a declared type that does not match the content with 415', async () => {
    await expect(
      controller.upload(user, file(await makeDocx(['x']), PDF)),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('refuses an unsupported content type with 415', async () => {
    await expect(
      controller.upload(user, file(new Uint8Array([1, 2, 3]), 'image/png')),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('accepts a real PDF and a real DOCX', async () => {
    await controller.upload(user, file(makePdf([['Shartnoma']]), PDF, 'a.pdf'));
    await controller.upload(
      user,
      file(await makeDocx(['Shartnoma']), DOCX, 'b.docx'),
    );
    expect(stored).toEqual(['a.pdf', 'b.docx']);
  });
});
