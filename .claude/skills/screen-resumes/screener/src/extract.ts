import type Anthropic from '@anthropic-ai/sdk';
import { getCachedExtract, hashString, setCachedExtract } from './cache';
import type { ResumeExtract } from './types';
import { ResumeExtractSchema } from './types';

export const PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from resumes accurately and completely.

Guidelines:
- skills: Include ALL technical skills, tools, languages, and frameworks mentioned ANYWHERE in the resume — including ones only mentioned inside job bullets. Be thorough.
- jobs: List in reverse chronological order. Set end to null for current or present roles.
- agency_phrases: Find verbatim phrases showing the candidate taking ownership, making decisions, driving outcomes, or leading initiatives. The phrase must have a clear first-person or role-based subject. Strong examples: "made the call to migrate", "owned the on-call rotation", "pushed back on the timeline", "hired and grew the team to 8", "defined the roadmap", "decided to deprecate the legacy API". Do NOT include passive phrases like "was responsible for", "helped with", or "assisted in".
- education: Include all degrees. Identify undergrad types (B.S., B.A., B.Eng., Bachelor, BSc, BBA, etc.) accurately.`;

const EXTRACT_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: "Candidate's full name" },
    headline: {
      type: 'string',
      description: "Most recent job title + company, e.g. 'Senior Engineer at Stripe'",
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description:
        'All technical skills, tools, languages, frameworks mentioned anywhere in the resume',
    },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          start: {
            type: 'string',
            description: 'Year or year-month, e.g. "2021-03" or "2019"',
          },
          end: {
            type: ['string', 'null'],
            description: 'Year or year-month; null if current/present role',
          },
          bullets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Job responsibility and achievement bullets, verbatim',
          },
          skills_mentioned: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skills actually mentioned or demonstrated in this specific role',
          },
        },
        required: ['title', 'company', 'start', 'end', 'bullets', 'skills_mentioned'],
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          degree: {
            type: 'string',
            description: 'e.g. "B.S.", "Bachelor of Science", "MBA", "Ph.D."',
          },
          field: { type: ['string', 'null'], description: 'e.g. "Computer Science"' },
          school: { type: ['string', 'null'], description: 'University or college name' },
        },
        required: ['degree', 'field', 'school'],
      },
    },
    agency_phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phrase: {
            type: 'string',
            description: 'Verbatim phrase showing ownership or decision-making',
          },
          job_context: {
            type: 'string',
            description: 'Title and company, e.g. "Senior Engineer at Stripe"',
          },
          approximate_year: {
            type: ['integer', 'null'],
            description: 'Approximate year this occurred, or null if unclear',
          },
        },
        required: ['phrase', 'job_context', 'approximate_year'],
      },
    },
  },
  required: ['name', 'headline', 'skills', 'jobs', 'education', 'agency_phrases'],
};

export async function extractResume(
  filePath: string,
  text: string,
  workspace: string,
  client: Anthropic,
  verbose = false,
): Promise<ResumeExtract> {
  const textHash = hashString(text);

  const cached = await getCachedExtract(workspace, textHash, PROMPT_VERSION);
  if (cached) {
    if (verbose) process.stdout.write(`  ✓ cached   ${filePath}\n`);
    return ResumeExtractSchema.parse(cached);
  }

  if (verbose) process.stdout.write(`  → extract  ${filePath}\n`);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'extract_resume',
        description: 'Extract structured information from a resume. Populate all fields.',
        input_schema: EXTRACT_SCHEMA,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_resume' },
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this resume:\n\n${text}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Extraction failed for ${filePath}: no tool_use in response`);
  }

  const extracted = { file: filePath, ...(toolUse.input as object) };

  try {
    const parsed = ResumeExtractSchema.parse(extracted);
    await setCachedExtract(workspace, textHash, PROMPT_VERSION, extracted);
    return parsed;
  } catch (err) {
    throw new Error(
      `Extraction schema mismatch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
