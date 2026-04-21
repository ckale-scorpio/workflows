import { z } from 'zod';

export const currencySchema = z.enum(['usd', 'eur', 'gbp']);
export type Currency = z.infer<typeof currencySchema>;

export const moneySchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

export function formatMoney({ amountCents, currency }: Money): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
