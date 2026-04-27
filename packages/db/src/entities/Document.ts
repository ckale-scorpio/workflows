import { EntitySchema } from '@mikro-orm/core';

export interface Document {
  id: string;
  title: string;
  currentRevision: number;
  content: Record<string, unknown>[];
  createdAt: Date;
  updatedAt: Date;
}

export const DocumentSchema = new EntitySchema<Document>({
  name: 'Document',
  tableName: 'documents',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    title: { type: 'string', default: 'Untitled' },
    currentRevision: { type: 'integer', fieldName: 'current_revision', default: 0 },
    content: {
      type: 'jsonb',
      default: '[{"type":"paragraph","children":[{"text":""}]}]',
    },
    createdAt: { type: Date, fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: {
      type: Date,
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onUpdate: () => new Date(),
    },
  },
});
