import { Injectable } from '@nestjs/common';
import type { ApplyEdit, DocProcessingService, ExtractedDoc } from '../../law-search/law-search.types.js';
import { applyDocxEdits } from './apply-edits.js';
import { extractDocument } from './extract.js';

/**
 * The real document processing behind `DOC_PROCESSING`. Everything happens in memory; nothing here logs document text.
 */
@Injectable()
export class DocumentProcessingService implements DocProcessingService {
  extractText(bytes: Uint8Array, contentType: string): Promise<ExtractedDoc> {
    return extractDocument(bytes, contentType);
  }

  /**
   * DOCX in, DOCX out, formatting kept. Throws EditNotFoundError(i)
   * when edit i's `original` is not in the document exactly once.
   */
  applyEdits(docx: Uint8Array, edits: ApplyEdit[]): Promise<Uint8Array> {
    return applyDocxEdits(docx, edits);
  }
}
