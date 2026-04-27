import { EntitySchema } from '@mikro-orm/core';
import type { Document } from './Document';

export interface DocumentOperation {
  id: string;
  document: Document;
  serverRev: number;
  clientId: string;
  clientRev: number;
  op: Record<string, unknown>;
  appliedAt: Date;
}

export const DocumentOperationSchema = new EntitySchema<DocumentOperation>({
  name: 'DocumentOperation',
  tableName: 'document_operations',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    document: {
      kind: 'm:1',
      entity: 'Document',
      fieldName: 'document_id',
      deleteRule: 'cascade',
      index: true,
    },
    serverRev: { type: 'integer', fieldName: 'server_rev' },
    clientId: { type: 'string', fieldName: 'client_id' },
    clientRev: { type: 'integer', fieldName: 'client_rev' },
    op: { type: 'jsonb' },
    appliedAt: { type: Date, fieldName: 'applied_at', defaultRaw: 'now()' },
  },
  uniques: [{ properties: ['document', 'serverRev'] }],
});
