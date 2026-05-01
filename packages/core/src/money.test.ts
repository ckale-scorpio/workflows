import { describe, expect, it } from 'vitest';
import { formatMoney, moneySchema } from './money';

describe('money', () => {
  it('formats USD correctly', () => {
    expect(formatMoney({ amountCents: 12345, currency: 'usd' })).toBe('$123.45');
  });

  it('validates shape', () => {
    expect(() => moneySchema.parse({ amountCents: -1, currency: 'usd' })).toThrow();
    expect(moneySchema.parse({ amountCents: 0, currency: 'eur' })).toEqual({
      amountCents: 0,
      currency: 'eur',
    });
  });
});
