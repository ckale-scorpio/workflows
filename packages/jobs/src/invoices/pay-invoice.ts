import {
  loadInvoiceForPayment,
  markInvoiceFailed,
  markInvoicePaid,
  recordPaymentAttempt,
  updatePaymentAttempt,
  withServerContext,
} from '@app/services';
import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { classifyPaymentFailure } from './agents/dispute-classifier';
import { draftDunningEmail } from './agents/dunning-drafter';

const MAX_RETRY_ATTEMPTS = 3;

export const payInvoice = inngest.createFunction(
  {
    id: 'pay-invoice',
    name: 'Pay Invoice',
    retries: 2,
    concurrency: { key: 'event.data.invoiceId', limit: 1 },
    idempotency: 'event.data.idempotencyKey',
  },
  { event: 'invoice/payment.requested' },
  async ({ event, step, logger }) => {
    const { invoiceId } = event.data;

    const invoice = await step.run('load-invoice', async () => {
      logger.info('loading invoice', { invoiceId });
      const loaded = await withServerContext((ctx) => loadInvoiceForPayment(ctx, invoiceId));
      if (!loaded) {
        throw new NonRetriableError(`Invoice ${invoiceId} not found`);
      }
      return loaded;
    });

    if (!invoice.stripeCustomerId) {
      throw new NonRetriableError('Invoice has no Stripe customer');
    }

    await step.run('validate-payment-method', async () => {
      // TODO: call stripe.customers.retrieve + check for default PM
      return { ok: true };
    });

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const attemptId = await step.run(`record-attempt-${attempt}`, async () => {
        return withServerContext(async (ctx) => {
          const pa = await recordPaymentAttempt(ctx, {
            invoiceId,
            attemptNumber: attempt,
            status: 'pending',
          });
          return pa.id;
        });
      });

      const chargeResult = await step.run(`attempt-charge-${attempt}`, async () => {
        // TODO: call stripe.paymentIntents.create with idempotency key
        const result: {
          status: 'succeeded' | 'failed';
          paymentIntentId: string;
          declineCode: string | null;
          errorMessage: string | null;
        } = {
          status: 'failed',
          paymentIntentId: 'stub-pi',
          declineCode: 'insufficient_funds',
          errorMessage: 'Stubbed failure',
        };

        await withServerContext((ctx) =>
          updatePaymentAttempt(ctx, attemptId, {
            status: result.status,
            stripePaymentIntentId: result.paymentIntentId,
            declineCode: result.declineCode,
            completedAt: new Date(),
          }),
        );
        return result;
      });

      if (chargeResult.status === 'succeeded') {
        await step.run('record-success', async () =>
          withServerContext((ctx) => markInvoicePaid(ctx, invoiceId)),
        );
        await step.sendEvent('emit-paid', {
          name: 'invoice/paid',
          data: { invoiceId },
        });
        return { ok: true, attempts: attempt };
      }

      const classification = await step.run(`classify-failure-${attempt}`, async () => {
        const result = await classifyPaymentFailure({
          declineCode: chargeResult.declineCode,
          stripeErrorMessage: chargeResult.errorMessage,
          previousAttempts: [],
        });
        await withServerContext((ctx) =>
          updatePaymentAttempt(ctx, attemptId, {
            failureCategory: result.category,
            agentReasoning: result.reasoning,
            agentModel: result.model,
          }),
        );
        return result;
      });

      if (classification.category === 'fraud_suspected') {
        await step.sendEvent('emit-fraud-review', {
          name: 'invoice/fraud.review_needed',
          data: { invoiceId, paymentAttemptId: attemptId },
        });
        throw new NonRetriableError('Fraud suspected — paused for human review');
      }

      if (classification.category === 'permanent') {
        break;
      }

      if (classification.category === 'needs_customer_action') {
        const email = await step.run(`draft-dunning-${attempt}`, async () => {
          return draftDunningEmail({
            customerName: invoice.customerFullName ?? invoice.customerEmail,
            invoiceNumber: `INV-${invoice.id.slice(0, 8)}`,
            amountFormatted: `${(invoice.amountCents / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`,
            failureCategory: classification.category,
            attemptNumber: attempt,
            updatePaymentUrl: `https://app.example.com/invoices/${invoiceId}/pay`,
          });
        });

        await step.run(`send-dunning-email-${attempt}`, async () => {
          // TODO: send via Resend
          logger.info('would send dunning email', {
            to: invoice.customerEmail,
            subject: email.subject,
          });
        });

        const updated = await step.waitForEvent(`wait-customer-pm-${attempt}`, {
          event: 'invoice/customer.updated_payment',
          if: `async.data.invoiceId == "${invoiceId}"`,
          timeout: '7d',
        });

        if (!updated) {
          break;
        }
        continue;
      }

      if (classification.category === 'retryable' && attempt < MAX_RETRY_ATTEMPTS) {
        await step.sleep(`backoff-${attempt}`, '3d');
        continue;
      }

      break;
    }

    await step.run('record-failure', async () =>
      withServerContext((ctx) => markInvoiceFailed(ctx, invoiceId)),
    );
    await step.sendEvent('emit-failed', {
      name: 'invoice/payment.failed',
      data: { invoiceId, reason: 'exhausted-retries' },
    });
    return { ok: false };
  },
);
