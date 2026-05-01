import { z } from 'zod';

export const invoicePaymentRequestedSchema = z.object({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
});

export const stripePaymentIntentSucceededSchema = z.object({
  paymentIntentId: z.string(),
  invoiceId: z.string().uuid(),
});

export const invoiceCustomerUpdatedPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  customerId: z.string().uuid(),
});

export type InvoiceEvents = {
  'invoice/payment.requested': {
    data: z.infer<typeof invoicePaymentRequestedSchema>;
  };
  'stripe/payment_intent.succeeded': {
    data: z.infer<typeof stripePaymentIntentSucceededSchema>;
  };
  'invoice/customer.updated_payment': {
    data: z.infer<typeof invoiceCustomerUpdatedPaymentSchema>;
  };
  'invoice/paid': {
    data: { invoiceId: string };
  };
  'invoice/payment.failed': {
    data: { invoiceId: string; reason: string };
  };
  'invoice/fraud.review_needed': {
    data: { invoiceId: string; paymentAttemptId: string };
  };
};
