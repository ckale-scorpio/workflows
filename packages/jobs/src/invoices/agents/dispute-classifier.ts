import { z } from 'zod';
import { getAnthropic, MODEL } from '../../client';

export const failureCategorySchema = z.enum([
  'retryable',
  'needs_customer_action',
  'fraud_suspected',
  'permanent',
  'unknown',
]);

export const classifierOutputSchema = z.object({
  category: failureCategorySchema,
  reasoning: z.string(),
  suggestedAction: z.string(),
});

export type ClassifierOutput = z.infer<typeof classifierOutputSchema> & { model: string };

const SYSTEM_PROMPT = `You are a payment failure classifier for a B2B billing system.
Given a Stripe decline code and recent payment history, classify the failure into one of:
- retryable: transient issue, a retry in 1-3 days is likely to succeed (e.g. insufficient_funds, processing_error)
- needs_customer_action: customer must update payment method or unblock bank (e.g. expired_card, do_not_honor, issuer_not_available)
- fraud_suspected: pattern indicates fraud or card testing
- permanent: card is closed/lost/stolen and no retry will succeed
- unknown: cannot determine with confidence

Respond with JSON matching the provided schema. Be conservative: prefer needs_customer_action over retryable if unsure.`;

export interface ClassifierInput {
  declineCode: string | null;
  stripeErrorMessage: string | null;
  previousAttempts: Array<{
    attemptNumber: number;
    status: string;
    declineCode: string | null;
    daysAgo: number;
  }>;
}

export async function classifyPaymentFailure(input: ClassifierInput): Promise<ClassifierOutput> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: MODEL.default,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Decline code: ${input.declineCode ?? 'none'}
Stripe error: ${input.stripeErrorMessage ?? 'none'}
Previous attempts: ${JSON.stringify(input.previousAttempts)}

Respond with JSON: { "category": "...", "reasoning": "...", "suggestedAction": "..." }`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Classifier did not return JSON: ${text}`);
  const parsed = classifierOutputSchema.parse(JSON.parse(jsonMatch[0]));
  return { ...parsed, model: MODEL.default };
}

// Type-only import kept at bottom to avoid pulling types eagerly.
import type Anthropic from '@anthropic-ai/sdk';
