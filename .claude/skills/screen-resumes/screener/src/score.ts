import type { JD, ResumeExtract, ScoredResume } from './types';

function parseJobDate(s: string): Date {
  const clean = s.trim();
  if (/^\d{4}$/.test(clean)) return new Date(parseInt(clean, 10), 11, 31);
  if (/^\d{4}-\d{2}$/.test(clean)) {
    const [y, m] = clean.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  const d = new Date(clean);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function endTimestamp(end: string | null): number {
  return end === null ? Date.now() : parseJobDate(end).getTime();
}

export function recencyFactor(end: string | null, windowYears: number): number {
  const yearsAgo = (Date.now() - endTimestamp(end)) / (1000 * 60 * 60 * 24 * 365.25);
  if (yearsAgo <= windowYears) return 1.0;
  if (yearsAgo <= windowYears * 1.75) return 0.5;
  return 0.15;
}

function hasUndergrad(extract: ResumeExtract): boolean {
  const pattern =
    /\b(b\.?s\.?|b\.?a\.?|b\.?eng\.?|b\.?tech\.?|b\.?sc\.?|b\.?b\.?a\.?|bachelor|baccalaureate)\b/i;
  return extract.education.some((e) => pattern.test(e.degree));
}

export function scoreResume(extract: ResumeExtract, jd: JD): ScoredResume {
  const { required_skills, preferred_skills, recency_window_years, weights, must_have_undergrad } =
    jd;

  // Build map: skill (lowercase) → best recency factor from any job it appeared in
  const skillRecencyMap = new Map<string, number>();
  for (const job of extract.jobs) {
    const factor = recencyFactor(job.end, recency_window_years);
    for (const skill of job.skills_mentioned) {
      const key = skill.toLowerCase();
      skillRecencyMap.set(key, Math.max(skillRecencyMap.get(key) ?? 0, factor));
    }
  }

  const allSkillsLower = new Set(extract.skills.map((s) => s.toLowerCase()));
  const matchedRequired: string[] = [];
  const matchedPreferred: string[] = [];
  let rawSkillScore = 0;

  for (const skill of required_skills) {
    const key = skill.toLowerCase();
    if (allSkillsLower.has(key)) {
      matchedRequired.push(skill);
      // Fall back to 0.5 if listed on resume but not attributed to a specific job
      rawSkillScore += 1.0 * (skillRecencyMap.get(key) ?? 0.5);
    }
  }
  for (const skill of preferred_skills) {
    const key = skill.toLowerCase();
    if (allSkillsLower.has(key)) {
      matchedPreferred.push(skill);
      rawSkillScore += 0.4 * (skillRecencyMap.get(key) ?? 0.5);
    }
  }

  const maxSkillScore = required_skills.length * 1.0 + preferred_skills.length * 0.4;
  const skill_score = maxSkillScore > 0 ? Math.min(rawSkillScore / maxSkillScore, 1.0) : 0;

  // Recency score: how current is the candidate? Keyed on their most recent role's end date.
  const sortedJobs = [...extract.jobs].sort((a, b) => endTimestamp(b.end) - endTimestamp(a.end));
  const recency_score = sortedJobs[0]
    ? recencyFactor(sortedJobs[0].end, recency_window_years)
    : 0.5;

  // Agency score: recency-weighted ownership phrases, normalized (4 strong recent phrases = 1.0)
  const agencyTotal = extract.agency_phrases.reduce((sum, ap) => {
    const factor = ap.approximate_year
      ? recencyFactor(String(ap.approximate_year), recency_window_years)
      : 0.5;
    return sum + factor;
  }, 0);
  const agency_score = Math.min(agencyTotal / 4, 1.0);

  const total_score =
    weights.skills * skill_score + weights.recency * recency_score + weights.agency * agency_score;

  const has_undergrad = hasUndergrad(extract);
  const disqualified = must_have_undergrad && !has_undergrad;

  // Top agency phrases from within the recency window
  const recentYear = new Date().getFullYear() - recency_window_years;
  const top_agency_phrases = extract.agency_phrases
    .filter((ap) => !ap.approximate_year || ap.approximate_year >= recentYear)
    .slice(0, 3)
    .map((ap) => ap.phrase);

  return {
    file: extract.file,
    name: extract.name,
    headline: extract.headline,
    total_score: disqualified ? 0 : total_score,
    skill_score,
    recency_score,
    agency_score,
    has_undergrad,
    disqualified,
    matched_required: matchedRequired,
    matched_preferred: matchedPreferred,
    top_agency_phrases,
  };
}
