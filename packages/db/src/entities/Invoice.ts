import { EntitySchema } from '@mikro-orm/core';
import type { Profile } from './Profile';

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface Invoice {
  id: string;
  customer: Profile;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  dueAt: Date | null;
  stripeInvoiceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const InvoiceSchema = new EntitySchema<Invoice>({
  name: 'Invoice',
  tableName: 'invoices',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    customer: {
      kind: 'm:1',
      entity: 'Profile',
      fieldName: 'customer_id',
      deleteRule: 'restrict',
      index: true,
    },
    amountCents: { type: 'bigint', fieldName: 'amount_cents' },
    currency: { type: 'string', default: 'usd' },
    status: {
      type: 'string',
      enum: true,
      items: () => ['draft', 'pending', 'paid', 'failed', 'cancelled', 'refunded'],
      default: 'draft',
      nativeEnumName: 'invoice_status',
      index: true,
    },
    dueAt: { type: Date, fieldName: 'due_at', nullable: true },
    stripeInvoiceId: {
      type: 'string',
      fieldName: 'stripe_invoice_id',
      nullable: true,
      unique: true,
    },
    metadata: { type: 'jsonb', default: '{}' },
    createdAt: { type: Date, fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: {
      type: Date,
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onUpdate: () => new Date(),
    },
  },
});
