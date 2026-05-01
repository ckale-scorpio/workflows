import { type Document, DocumentOperationSchema } from '@app/db';
import type { ServerContext } from '../context';

export interface RecordOperationInput {
  clientId: string;
  clientRev: number;
  serverRev: number;
  op: Record<string, unknown>;
  newContent: Record<string, unknown>[];
  newRevision: number;
}

// doc must already be loaded in ctx.em (e.g. from lockDocumentForUpdate).
// MikroORM's identity map returns the same entity instance, so mutations here
// are picked up by the enclosing em.flush() / em.transactional() flush.
export async function recordOperation(
  ctx: ServerContext,
  doc: Document,
  input: RecordOperationInput,
): Promise<void> {
  doc.currentRevision = input.newRevision;
  doc.content = input.newContent;

  ctx.em.create(DocumentOperationSchema, {
    document: doc,
    serverRev: input.serverRev,
    clientId: input.clientId,
    clientRev: input.clientRev,
    op: input.op,
    appliedAt: new Date(),
  });
}
