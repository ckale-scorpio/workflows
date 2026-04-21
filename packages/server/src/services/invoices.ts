import { type Invoice, InvoiceSchema, type InvoiceStatus } from '@app/db';
import type { ServerContext } from '../context';

export async function findInvoice(ctx: ServerContext, id: string): Promise<Invoice | null> {
  return ctx.em.findOne(InvoiceSchema, { id });
}

export interface InvoiceForPayment {
  id: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  customerId: string;
  customerEmail: string;
  customerFullName: string | null;
  stripeCustomerId: string | null;
}

export async function loadInvoiceForPayment(
  ctx: ServerContext,
  id: string,
): Promise<InvoiceForPayment | null> {
  const invoice = await ctx.em.findOne(InvoiceSchema, { id }, { populate: ['customer'] });
  if (!invoice) return null;
  return {
    id: invoice.id,
    amountCents: Number(invoice.amountCents),
    currency: invoice.currency,
    status: invoice.status,
    customerId: invoice.customer.id,
    customerEmail: invoice.customer.email,
    customerFullName: invoice.customer.fullName,
    stripeCustomerId: invoice.customer.stripeCustomerId,
  };
}

export async function markInvoicePaid(ctx: ServerContext, id: string): Promise<void> {
  const invoice = await ctx.em.findOneOrFail(InvoiceSchema, { id });
  invoice.status = 'paid';
}

export async function markInvoiceFailed(ctx: ServerContext, id: string): Promise<void> {
  const invoice = await ctx.em.findOneOrFail(InvoiceSchema, { id });
  invoice.status = 'failed';
}
