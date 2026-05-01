import { z } from 'zod';
import { getAnthropic, MODEL } from '../../client';

export const dunningEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  tone: z.enum(['friendly', 'firm', 'final']),
});

export type DunningEmail = z.infer<typeof dunningEmailSchema>;

const SYSTEM_PROMPT = `You draft dunning emails for a B2B SaaS product. Your emails are concise, professional, and specific.
Tone options:
- friendly: first nudge, assume good intent, emphasise easy fix
- firm: second nudge after >7 days, be direct about next steps
- final: final notice before service suspension

Always include: invoice number, amount, a single clear call-to-action with a link. Never threaten or shame.
Respond with JSON: { "subject": "...", "body": "...", "tone": "..." }`;

export interface DrafterInput {
  customerName: string;
  invoiceNumber: string;
  amountFormatted: string;
  failureCategory: string;
  attemptNumber: number;
  updatePaymentUrl: string;
}

export async function draftDunningEmail(input: DrafterInput): Promise<DunningEmail> {
  const client = getAnthropic();
  const tone = input.attemptNumber === 1 ? 'friendly' : input.attemptNumber < 3 ? 'firm' : 'final';
  const response = await client.messages.create({
    model: MODEL.default,
    max_tokens: 1024,
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
        content: `Draft a ${tone} dunning email.
Customer: ${input.customerName}
Invoice: ${input.invoiceNumber}
Amount: ${input.amountFormatted}
Failure category: ${input.failureCategory}
Attempt number: ${input.attemptNumber}
Update payment URL: ${input.updatePaymentUrl}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Drafter did not return JSON: ${text}`);
  return dunningEmailSchema.parse(JSON.parse(jsonMatch[0]));
}

import type Anthropic from '@anthropic-ai/sdk';
