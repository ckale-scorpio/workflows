import { EntitySchema } from '@mikro-orm/core';
import type { Document } from './Document';
import type { Profile } from './Profile';

export interface DocumentMember {
  id: string;
  document: Document;
  user: Profile;
  joinedAt: Date;
}

export const DocumentMemberSchema = new EntitySchema<DocumentMember>({
  name: 'DocumentMember',
  tableName: 'document_members',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    document: {
      kind: 'm:1',
      entity: 'Document',
      fieldName: 'document_id',
      deleteRule: 'cascade',
      index: true,
    },
    user: {
      kind: 'm:1',
      entity: 'Profile',
      fieldName: 'user_id',
      deleteRule: 'cascade',
      index: true,
    },
    joinedAt: { type: Date, fieldName: 'joined_at', defaultRaw: 'now()' },
  },
  uniques: [{ properties: ['document', 'user'] }],
});
