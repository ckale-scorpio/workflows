import {
  type Document,
  type DocumentMember,
  DocumentMemberSchema,
  type DocumentOperation,
  DocumentOperationSchema,
  DocumentSchema,
  ProfileSchema,
} from '@app/db';
import { LockMode } from '@mikro-orm/core';
import type { ServerContext } from '../context';

export async function createDocument(
  ctx: ServerContext,
  input: { title: string },
): Promise<Document> {
  const now = new Date();
  // Generate the UUID in JS so doc.id is available before flush.
  // defaultRaw: 'gen_random_uuid()' only fires at INSERT time, leaving id undefined until then.
  return ctx.em.create(DocumentSchema, {
    id: crypto.randomUUID(),
    title: input.title,
    currentRevision: 0,
    content: [{ type: 'paragraph', children: [{ text: '' }] }],
    createdAt: now,
    updatedAt: now,
  });
}

export async function loadDocument(ctx: ServerContext, docId: string): Promise<Document | null> {
  return ctx.em.findOne(DocumentSchema, { id: docId });
}

export async function listDocumentMembers(
  ctx: ServerContext,
  docId: string,
): Promise<DocumentMember[]> {
  return ctx.em.find(DocumentMemberSchema, { document: docId });
}

export async function joinDocument(
  ctx: ServerContext,
  docId: string,
  userId: string,
): Promise<DocumentMember> {
  const existing = await ctx.em.findOne(DocumentMemberSchema, {
    document: docId,
    user: userId,
  });
  if (existing) return existing;

  const count = await ctx.em.count(DocumentMemberSchema, { document: docId });
  if (count >= 2) {
    throw Object.assign(new Error('Document is full (2 members maximum)'), { code: 'DOC_FULL' });
  }

  return ctx.em.create(DocumentMemberSchema, {
    document: ctx.em.getReference(DocumentSchema, docId),
    user: ctx.em.getReference(ProfileSchema, userId),
    joinedAt: new Date(),
  });
}

export interface LockResult {
  doc: Document;
  concurrentOps: DocumentOperation[];
}

// Must be called inside withTransactionalContext so the SELECT FOR UPDATE lock
// is held until the transaction commits along with the subsequent writes.
export async function lockDocumentForUpdate(
  ctx: ServerContext,
  docId: string,
  sinceRev: number,
  excludeClientId: string,
): Promise<LockResult> {
  const doc = await ctx.em.findOneOrFail(
    DocumentSchema,
    { id: docId },
    {
      lockMode: LockMode.PESSIMISTIC_WRITE,
    },
  );

  const concurrentOps = await ctx.em.find(
    DocumentOperationSchema,
    {
      document: docId,
      serverRev: { $gt: sinceRev },
      clientId: { $ne: excludeClientId },
    },
    { orderBy: { serverRev: 'asc' } },
  );

  return { doc, concurrentOps };
}
