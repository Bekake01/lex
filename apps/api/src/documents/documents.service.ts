import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { CurrentUser } from '../common/current-user.js';
import { sha256 } from '../common/hash.js';
import { DB, type Db } from '../db/db.module.js';
import { documents, type Document } from '../db/schema/index.js';
import { StorageService } from '../storage/storage.service.js';

export interface UploadInput {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

/** What `apps/api` accepts as a contract file. */
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  DOCX_CONTENT_TYPE,
  'text/plain',
  'text/markdown',
];

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  async upload(user: CurrentUser, input: UploadInput): Promise<Document> {
    const digest = sha256(input.bytes);

    // Insert first to get the id the storage key is built from, then write the
    // bytes: a row whose file is missing is recoverable, an orphan file is not.
    const [row] = await this.db
      .insert(documents)
      .values({
        ownerUserId: user.id,
        agencyId: user.agencyId,
        name: input.name,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        sha256: digest,
        storageKey: 'pending',
        version: 1,
      })
      .returning();

    const storageKey = this.storage.buildKey(row.id, input.name);
    await this.storage.put(storageKey, input.bytes);

    const [stored] = await this.db
      .update(documents)
      .set({ storageKey, rootDocumentId: row.id })
      .where(eq(documents.id, row.id))
      .returning();
    return stored;
  }

  /**
   * A new version of an existing document: the parent's bytes are never
   * touched, so v1 stays available as evidence of what was reviewed.
   */
  async createVersion(
    parent: Document,
    input: { name: string; contentType: string; bytes: Uint8Array },
  ): Promise<Document> {
    const [row] = await this.db
      .insert(documents)
      .values({
        ownerUserId: parent.ownerUserId,
        agencyId: parent.agencyId,
        name: input.name,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        sha256: sha256(input.bytes),
        storageKey: 'pending',
        version: parent.version + 1,
        parentDocumentId: parent.id,
        rootDocumentId: parent.rootDocumentId ?? parent.id,
      })
      .returning();

    const storageKey = this.storage.buildKey(row.id, input.name);
    await this.storage.put(storageKey, input.bytes);

    const [stored] = await this.db
      .update(documents)
      .set({ storageKey })
      .where(eq(documents.id, row.id))
      .returning();
    return stored;
  }

  async byId(id: string): Promise<Document | undefined> {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    return row;
  }

  /** 404 when it does not exist, 403 when it belongs to someone else. */
  async forUser(user: CurrentUser, id: string): Promise<Document> {
    const doc = await this.byId(id);
    if (!doc) throw new NotFoundException('Document not found');
    assertAccess(user, doc);
    return doc;
  }

  /** Every version of the chain this document belongs to, oldest first. */
  async versions(doc: Document): Promise<Document[]> {
    const rootId = doc.rootDocumentId ?? doc.id;
    return this.db
      .select()
      .from(documents)
      .where(or(eq(documents.rootDocumentId, rootId), eq(documents.id, rootId)))
      .orderBy(asc(documents.version));
  }

  /** A document is the latest version when nothing was derived from it. */
  async isLatest(doc: Document): Promise<boolean> {
    const [child] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.parentDocumentId, doc.id))
      .limit(1);
    return child === undefined;
  }

  /** The newest version in the chain, used to block sending an old one. */
  async latestOf(doc: Document): Promise<Document> {
    const all = await this.versions(doc);
    return all[all.length - 1] ?? doc;
  }
}

/**
 * No tenant isolation for the hackathon (see CLAUDE.md): a plain owner check,
 * widened to the agency so colleagues can see each other's documents.
 */
export function assertAccess(user: CurrentUser, doc: Document): void {
  if (doc.ownerUserId === user.id) return;
  if (doc.agencyId && doc.agencyId === user.agencyId) return;
  throw new ForbiddenException();
}

/** Kept for the rare query that needs the condition rather than a thrown error. */
export function accessCondition(user: CurrentUser) {
  return user.agencyId
    ? or(
        eq(documents.ownerUserId, user.id),
        eq(documents.agencyId, user.agencyId),
      )
    : and(eq(documents.ownerUserId, user.id), isNull(documents.agencyId));
}
