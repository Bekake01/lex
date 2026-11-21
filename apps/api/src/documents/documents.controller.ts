import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  kindOfContentType,
  sniffDocumentKind,
} from '../law/documents/file-type.js';
import type {
  DocumentList,
  DocumentVersionWire,
  DocumentWire,
} from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { contentDisposition } from '../common/pdf-file.js';
import { ENV, type Env } from '../config/env.js';
import { StorageService } from '../storage/storage.service.js';
import { toDocumentVersionWire, toDocumentWire } from '../ai-review/mappers.js';
import {
  ALLOWED_CONTENT_TYPES,
  DocumentsService,
} from './documents.service.js';

/** The uploaded file as multer hands it over. */
interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('documents')
@UseGuards(CurrentUserGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Upload a contract. The AI review is a separate, explicit request. */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @User() user: CurrentUser,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<DocumentWire> {
    if (!file) throw new BadRequestException('A `file` field is required');
    if (file.size > this.env.MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('The file is too large');
    }
    if (!ALLOWED_CONTENT_TYPES.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }
    // The declared type is only a claim; check what the bytes really are.
    const actual = sniffDocumentKind(new Uint8Array(file.buffer));
    if (!actual || actual !== kindOfContentType(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'The file content does not match its type. Upload a real PDF, DOCX or plain-text file',
      );
    }

    const document = await this.documents.upload(user, {
      name: file.originalname,
      contentType: file.mimetype,
      bytes: new Uint8Array(file.buffer),
    });
    return toDocumentWire(document, true);
  }

  /** My documents, latest versions only (no clause data), newest first. */
  @Get()
  async list(@User() user: CurrentUser): Promise<DocumentList> {
    const docs = await this.documents.listForUser(user);
    return {
      documents: docs.map((d) => {
        const { clauses: _clauses, ...wire } = toDocumentWire(d, true);
        return wire;
      }),
    };
  }

  @Get(':id')
  async get(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentWire> {
    const document = await this.documents.forUser(user, id);
    return toDocumentWire(document, await this.documents.isLatest(document));
  }

  /** The bytes, with their stored type (the signing editor renders the PDF). */
  @Get(':id/file')
  async file(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const document = await this.documents.forUser(user, id);
    const bytes = await this.storage.get(document.storageKey);
    return new StreamableFile(bytes, {
      type: document.contentType,
      disposition: contentDisposition('inline', document.name),
      length: bytes.byteLength,
    });
  }

  /** Every version of this document, oldest first. */
  @Get(':id/versions')
  async versions(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentVersionWire[]> {
    const document = await this.documents.forUser(user, id);
    const versions = await this.documents.versions(document);
    if (versions.length === 0)
      throw new NotFoundException('Document not found');
    return versions.map(toDocumentVersionWire);
  }
}
