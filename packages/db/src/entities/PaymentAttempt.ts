import { EntitySchema } from '@mikro-orm/core';
import type { Invoice } from './Invoice';

export type PaymentAttemptStatus = 'pending' | 'requires_action' | 'succeeded' | 'failed';

export type FailureCategory =
  | 'retryable'
  | 'needs_customer_action'
  | 'fraud_suspected'
  | 'permanent'
  | 'unknown';

export interface PaymentAttempt {
  id: string;
  invoice: Invoice;
  attemptNumber: number;
  status: PaymentAttemptStatus;
  stripePaymentIntentId: string | null;
  declineCode: string | null;
  failureCategory: FailureCategory | null;
  agentReasoning: string | null;
  agentModel: string | null;
  error: Record<string, unknown> | null;
  startedAt: Date;
  completedAt: Date | null;
}

export const PaymentAttemptSchema = new EntitySchema<PaymentAttempt>({
  name: 'PaymentAttempt',
  tableName: 'payment_attempts',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    invoice: {
      kind: 'm:1',
      entity: 'Invoice',
      fieldName: 'invoice_id',
      deleteRule: 'cascade',
      index: true,
    },
    attemptNumber: { type: 'integer', fieldName: 'attempt_number' },
    status: {
      type: 'string',
      enum: true,
      items: () => ['pending', 'requires_action', 'succeeded', 'failed'],
      default: 'pending',
      nativeEnumName: 'payment_attempt_status',
    },
    stripePaymentIntentId: {
      type: 'string',
      fieldName: 'stripe_payment_intent_id',
      nullable: true,
    },
    declineCode: { type: 'string', fieldName: 'decline_code', nullable: true },
    failureCategory: {
      type: 'string',
      fieldName: 'failure_category',
      enum: true,
      items: () => [
        'retryable',
        'needs_customer_action',
        'fraud_suspected',
        'permanent',
        'unknown',
      ],
      nullable: true,
      nativeEnumName: 'failure_category',
    },
    agentReasoning: { type: 'text', fieldName: 'agent_reasoning', nullable: true },
    agentModel: { type: 'string', fieldName: 'agent_model', nullable: true },
    error: { type: 'jsonb', nullable: true },
    startedAt: { type: Date, fieldName: 'started_at', defaultRaw: 'now()' },
    completedAt: { type: Date, fieldName: 'completed_at', nullable: true },
  },
});
