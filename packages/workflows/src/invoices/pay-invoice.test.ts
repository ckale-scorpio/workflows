import { describe, expect, it } from 'vitest';
import { payInvoice } from './pay-invoice';

describe('payInvoice', () => {
  it('is registered as an Inngest function', () => {
    // Smoke test — just asserts the function is built and exported.
    expect(payInvoice).toBeDefined();
  });
});
