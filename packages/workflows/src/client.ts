import Anthropic from '@anthropic-ai/sdk';
import { EventSchemas, Inngest } from 'inngest';
import type { InvoiceEvents } from './events';

export const inngest = new Inngest({
  id: 'react-app',
  schemas: new EventSchemas().fromRecord<InvoiceEvents>(),
});

export type AppInngest = typeof inngest;

let cachedAnthropic: Anthropic | undefined;
export function getAnthropic(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  cachedAnthropic = new Anthropic({ apiKey });
  return cachedAnthropic;
}

export const MODEL = {
  default: 'claude-sonnet-4-6',
  hardReasoning: 'claude-opus-4-7',
} as const;
