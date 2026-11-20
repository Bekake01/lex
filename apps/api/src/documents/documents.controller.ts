import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { DocumentVersionWire, DocumentWire } from '@lex/contracts';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { ENV, type Env } from '../config/env.js';
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
    if (!ALLOWED_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }
    if (file.size > this.env.MAX_UPLOAD_BYTES) {
      throw new BadRequestException('The file is too large');
    }

    const document = await this.documents.upload(user, {
      name: file.originalname,
      contentType: file.mimetype,
      bytes: new Uint8Array(file.buffer),
    });
    return toDocumentWire(document, true);
  }

  @Get(':id')
  async get(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentWire> {
    const document = await this.documents.forUser(user, id);
    return toDocumentWire(document, await this.documents.isLatest(document));
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
