import type Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import type { JD, ResumeExtract, ScoredResume } from './types';

export async function explainResumes(
  scored: ScoredResume[],
  _extractMap: Map<string, ResumeExtract>,
  jd: JD,
  client: Anthropic,
  concurrency = 8,
  verbose = false,
): Promise<ScoredResume[]> {
  const topN = scored.filter((s) => !s.disqualified).slice(0, jd.top_n_explain);
  if (topN.length === 0) return scored;

  const limit = pLimit(concurrency);

  // Build the JD context block once — cache_control makes it shared across all N calls
  const jdLines = [
    `Role: ${jd.title}`,
    `Required skills: ${jd.required_skills.join(', ')}`,
    jd.preferred_skills.length ? `Preferred skills: ${jd.preferred_skills.join(', ')}` : '',
    jd.job_description ? `\nJob description:\n${jd.job_description}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const explained = await Promise.all(
    topN.map((candidate, i) =>
      limit(async () => {
        if (verbose)
          process.stdout.write(`  explaining ${i + 1}/${topN.length}: ${candidate.name}\n`);

        const agencyContext = candidate.top_agency_phrases.length
          ? candidate.top_agency_phrases.map((p) => `"${p}"`).join('; ')
          : 'none found';

        const summary = [
          `Candidate: ${candidate.name}`,
          `Headline: ${candidate.headline}`,
          `Required skills matched: ${candidate.matched_required.join(', ') || 'none'}`,
          `Preferred skills matched: ${candidate.matched_preferred.join(', ') || 'none'}`,
          `Agency phrases (recent): ${agencyContext}`,
          `Scores: skills=${(candidate.skill_score * 100).toFixed(0)}%, recency=${(candidate.recency_score * 100).toFixed(0)}%, agency=${(candidate.agency_score * 100).toFixed(0)}%`,
        ].join('\n');

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: jdLines,
                  // Identical across all calls — cached after first
                  cache_control: { type: 'ephemeral' },
                },
                {
                  type: 'text',
                  text: `Write a 2-3 sentence shortlist rationale for this candidate. Be specific: cite actual phrases from their resume. State what is strong, what is weaker or missing, and why they rank where they do.\n\n${summary}`,
                },
              ],
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        return {
          ...candidate,
          explanation: textBlock?.type === 'text' ? textBlock.text : undefined,
        };
      }),
    ),
  );

  // Merge explanations back; disqualified candidates keep their original entry
  const explainedMap = new Map(explained.map((r) => [r.file, r.explanation]));
  return scored.map((s) => ({ ...s, explanation: explainedMap.get(s.file) }));
}
