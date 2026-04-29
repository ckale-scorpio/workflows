import { z } from 'zod'

export const JDSchema = z.object({
  title: z.string(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()).default([]),
  recency_window_years: z.number().default(4),
  weights: z
    .object({
      skills: z.number(),
      recency: z.number(),
      agency: z.number(),
    })
    .refine((w) => Math.abs(w.skills + w.recency + w.agency - 1.0) < 0.01, {
      message: 'weights.skills + weights.recency + weights.agency must equal 1.0',
    }),
  must_have_undergrad: z.boolean().default(true),
  top_n_explain: z.number().int().default(30),
  job_description: z.string().default(''),
})
export type JD = z.infer<typeof JDSchema>

export const JobEntrySchema = z.object({
  title: z.string(),
  company: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  bullets: z.array(z.string()),
  skills_mentioned: z.array(z.string()),
})
export type JobEntry = z.infer<typeof JobEntrySchema>

export const EducationEntrySchema = z.object({
  degree: z.string(),
  field: z.string().nullable().optional(),
  school: z.string().nullable().optional(),
})
export type EducationEntry = z.infer<typeof EducationEntrySchema>

export const AgencyPhraseSchema = z.object({
  phrase: z.string(),
  job_context: z.string(),
  approximate_year: z.number().nullable(),
})
export type AgencyPhrase = z.infer<typeof AgencyPhraseSchema>

export const ResumeExtractSchema = z.object({
  file: z.string(),
  name: z.string(),
  headline: z.string(),
  skills: z.array(z.string()),
  jobs: z.array(JobEntrySchema),
  education: z.array(EducationEntrySchema),
  agency_phrases: z.array(AgencyPhraseSchema),
})
export type ResumeExtract = z.infer<typeof ResumeExtractSchema>

export interface ScoredResume {
  file: string
  name: string
  headline: string
  rank?: number
  total_score: number
  skill_score: number
  recency_score: number
  agency_score: number
  has_undergrad: boolean
  disqualified: boolean
  matched_required: string[]
  matched_preferred: string[]
  top_agency_phrases: string[]
  explanation?: string
}
