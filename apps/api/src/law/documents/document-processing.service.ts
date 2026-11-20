import { Injectable } from '@nestjs/common';
import type { ApplyEdit, DocProcessingService, ExtractedDoc } from '../../law-search/law-search.types.js';
import { extractDocument } from './extract.js';

/**
 * The real document processing behind `DOC_PROCESSING` (law plan, Phases
 * 11–13). Everything happens in memory; nothing here logs document text.
 */
@Injectable()
export class DocumentProcessingService implements DocProcessingService {
  extractText(bytes: Uint8Array, contentType: string): Promise<ExtractedDoc> {
    return extractDocument(bytes, contentType);
  }

  /** Phase 13 (DOCX edits that keep formatting) is not built yet. */
  async applyEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
    void docx;
    void edits;
    throw new Error('Applying edits to DOCX is not built yet');
  }
}
