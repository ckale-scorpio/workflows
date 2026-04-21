import {
  type FailureCategory,
  InvoiceSchema,
  type PaymentAttempt,
  PaymentAttemptSchema,
  type PaymentAttemptStatus,
} from '@app/db';
import type { ServerContext } from '../context';

export interface RecordPaymentAttemptInput {
  invoiceId: string;
  attemptNumber: number;
  status?: PaymentAttemptStatus;
  stripePaymentIntentId?: string | null;
}

export async function recordPaymentAttempt(
  ctx: ServerContext,
  input: RecordPaymentAttemptInput,
): Promise<PaymentAttempt> {
  const invoice = await ctx.em.findOneOrFail(InvoiceSchema, { id: input.invoiceId });
  return ctx.em.create(PaymentAttemptSchema, {
    invoice,
    attemptNumber: input.attemptNumber,
    status: input.status ?? 'pending',
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    declineCode: null,
    failureCategory: null,
    agentReasoning: null,
    agentModel: null,
    error: null,
    startedAt: new Date(),
    completedAt: null,
  });
}

export interface UpdatePaymentAttemptInput {
  status?: PaymentAttemptStatus;
  stripePaymentIntentId?: string | null;
  declineCode?: string | null;
  failureCategory?: FailureCategory | null;
  agentReasoning?: string | null;
  agentModel?: string | null;
  error?: Record<string, unknown> | null;
  completedAt?: Date | null;
}

export async function updatePaymentAttempt(
  ctx: ServerContext,
  id: string,
  patch: UpdatePaymentAttemptInput,
): Promise<void> {
  const attempt = await ctx.em.findOneOrFail(PaymentAttemptSchema, { id });
  ctx.em.assign(attempt, patch);
}

export async function listPaymentAttempts(
  ctx: ServerContext,
  invoiceId: string,
): Promise<PaymentAttempt[]> {
  return ctx.em.find(
    PaymentAttemptSchema,
    { invoice: invoiceId },
    { orderBy: { attemptNumber: 'asc' } },
  );
}
