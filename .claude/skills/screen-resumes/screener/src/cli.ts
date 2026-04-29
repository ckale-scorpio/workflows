#!/usr/bin/env node
import { Command } from 'commander'
import { readdir, mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import pLimit from 'p-limit'
import { loadJD } from './jd'
import { parsePDF } from './parse/pdf'
import { parseDOCX } from './parse/docx'
import {
  hashFile,
  hashString,
  getCachedText,
  setCachedText,
  getCachedExtract,
  listCachedExtracts,
} from './cache'
import { extractResume, PROMPT_VERSION } from './extract'
import { scoreResume } from './score'
import { explainResumes } from './explain'
import { ResumeExtractSchema } from './types'
import type { ResumeExtract, ScoredResume, JD } from './types'

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.doc'])

// ─── Output helpers ───────────────────────────────────────────────────────────

function csvEscape(val: unknown): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ].join('\n')
}

function scoreBar(score: number): string {
  const filled = Math.round(score * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// ─── Shared pipeline steps ────────────────────────────────────────────────────

async function parseAndExtract(
  resumeFiles: string[],
  workspace: string,
  client: Anthropic,
  concurrency: number,
  verbose: boolean,
): Promise<{ extracts: ResumeExtract[]; parseCacheHits: number; extractCacheHits: number }> {
  const limit = pLimit(concurrency)
  let parseCacheHits = 0
  let extractCacheHits = 0

  const extracts = await Promise.all(
    resumeFiles.map((filePath) =>
      limit(async () => {
        // Stage A: parse
        const fileHash = await hashFile(filePath)
        let text = await getCachedText(workspace, fileHash)
        if (text === null) {
          const ext = path.extname(filePath).toLowerCase()
          text = ext === '.pdf' ? await parsePDF(filePath) : await parseDOCX(filePath)
          await setCachedText(workspace, fileHash, text)
        } else {
          parseCacheHits++
        }

        // Stage B: extract
        const textHash = hashString(text)
        const cached = await getCachedExtract(workspace, textHash, PROMPT_VERSION)
        if (cached) {
          extractCacheHits++
          if (verbose) process.stdout.write(`  ✓ cached   ${path.basename(filePath)}\n`)
          return ResumeExtractSchema.parse(cached)
        }
        return extractResume(filePath, text, workspace, client, verbose)
      }),
    ),
  )

  return { extracts, parseCacheHits, extractCacheHits }
}

async function writeResults(
  workspace: string,
  scored: ScoredResume[],
  jd: JD,
): Promise<void> {
  const outputDir = path.join(workspace, 'output')
  if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true })

  const sorted = [...scored].sort((a, b) => {
    if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1
    return b.total_score - a.total_score
  })
  sorted.forEach((s, i) => (s.rank = i + 1))

  // results.json
  await writeFile(path.join(outputDir, 'results.json'), JSON.stringify(sorted, null, 2), 'utf8')

  // shortlist.csv
  const csvHeaders = [
    'rank', 'name', 'headline', 'total_score', 'skill_score', 'recency_score', 'agency_score',
    'has_undergrad', 'disqualified', 'matched_required', 'matched_preferred',
    'top_agency_phrases', 'explanation', 'file',
  ]
  const csvRows: Record<string, unknown>[] = sorted.map((s) => ({
    ...s,
    total_score: s.total_score.toFixed(3),
    skill_score: s.skill_score.toFixed(3),
    recency_score: s.recency_score.toFixed(3),
    agency_score: s.agency_score.toFixed(3),
    matched_required: s.matched_required.join('; '),
    matched_preferred: s.matched_preferred.join('; '),
    top_agency_phrases: s.top_agency_phrases.join(' | '),
    explanation: s.explanation ?? '',
  }))
  await writeFile(path.join(outputDir, 'shortlist.csv'), toCSV(csvRows, csvHeaders), 'utf8')

  // report.md
  const today = new Date().toISOString().split('T')[0]
  const lines: string[] = [
    `# Shortlist: ${jd.title}`,
    `**Generated**: ${today}  `,
    `**Scoring**: skills ${(jd.weights.skills * 100).toFixed(0)}% · recency ${(jd.weights.recency * 100).toFixed(0)}% · agency ${(jd.weights.agency * 100).toFixed(0)}%  `,
    `**Required skills**: ${jd.required_skills.join(', ')}  `,
    jd.preferred_skills.length ? `**Preferred skills**: ${jd.preferred_skills.join(', ')}` : '',
    '',
    '---',
    '',
  ]
  for (const s of sorted.filter((s) => !s.disqualified)) {
    lines.push(`## #${s.rank} — ${s.name} (${s.total_score.toFixed(3)})`)
    lines.push(`**${s.headline}**  `)
    lines.push(
      `Skills: required [${s.matched_required.join(', ') || 'none'}] · preferred [${s.matched_preferred.join(', ') || 'none'}]  `,
    )
    if (s.top_agency_phrases.length) {
      lines.push(`Agency: ${s.top_agency_phrases.map((p) => `"${p}"`).join(' · ')}  `)
    }
    if (s.explanation) {
      lines.push('')
      lines.push(s.explanation)
    }
    lines.push('', '---', '')
  }
  const disqualified = sorted.filter((s) => s.disqualified)
  if (disqualified.length) {
    lines.push('## Disqualified (no undergraduate degree detected)')
    for (const s of disqualified) lines.push(`- ${s.name} — ${s.headline}`)
  }

  await writeFile(path.join(outputDir, 'report.md'), lines.filter((l) => l !== undefined).join('\n'), 'utf8')
}

function printTopN(sorted: ScoredResume[], n = 10): void {
  const qualified = sorted.filter((s) => !s.disqualified).slice(0, n)
  console.log(`\nTop ${qualified.length} candidates:\n`)
  for (const s of qualified) {
    const req = s.matched_required.slice(0, 5).join(' · ')
    const agency = s.top_agency_phrases[0] ? `\n       "${s.top_agency_phrases[0]}"` : ''
    console.log(
      `  #${String(s.rank).padEnd(3)} ${s.name.padEnd(26)} ${scoreBar(s.total_score)} ${s.total_score.toFixed(2)}`,
    )
    if (req || agency) console.log(`       ${req}${agency}`)
    console.log()
  }
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set')
    process.exit(1)
  }
  return key
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const program = new Command()
  .name('screener')
  .description('Resume screener — rank candidates against a job description')
  .version('1.0.0')

program
  .command('screen')
  .description('Full pipeline: parse → extract → score → explain')
  .option('--workspace <path>', 'workspace directory', process.cwd())
  .option('--jd <path>', 'path to jd.yaml (default: <workspace>/jd.yaml)')
  .option('--resumes <path>', 'path to resumes folder (default: <workspace>/resumes)')
  .option('--concurrency <n>', 'max parallel API calls', '8')
  .option('--no-explain', 'skip Stage D narrative explanations')
  .option('--verbose', 'show per-file progress')
  .action(async (opts) => {
    const workspace = path.resolve(opts.workspace as string)
    const jdPath = (opts.jd as string | undefined) ?? path.join(workspace, 'jd.yaml')
    const resumesDir = (opts.resumes as string | undefined) ?? path.join(workspace, 'resumes')
    const concurrency = parseInt(opts.concurrency as string, 10)
    const verbose = opts.verbose as boolean ?? false
    const doExplain = opts.explain as boolean ?? true

    if (!existsSync(jdPath)) {
      console.error(`JD file not found: ${jdPath}`)
      console.error(`Copy the template: cp ~/.claude/skills/screen-resumes/references/jd-spec-template.yaml ${jdPath}`)
      process.exit(1)
    }
    if (!existsSync(resumesDir)) {
      console.error(`Resumes directory not found: ${resumesDir}`)
      process.exit(1)
    }

    const jd = await loadJD(jdPath)
    const client = new Anthropic({ apiKey: requireApiKey() })

    const allFiles = await readdir(resumesDir)
    const resumeFiles = allFiles
      .filter((f) => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(resumesDir, f))

    if (resumeFiles.length === 0) {
      console.error(`No PDF/DOCX files found in ${resumesDir}`)
      process.exit(1)
    }

    console.log(`\nFound ${resumeFiles.length} resume(s) in ${resumesDir}`)
    console.log('Stage A+B: Parsing and extracting...')

    const { extracts, parseCacheHits, extractCacheHits } = await parseAndExtract(
      resumeFiles, workspace, client, concurrency, verbose,
    )

    console.log(
      `  ${resumeFiles.length - parseCacheHits} parsed (${parseCacheHits} cached), ` +
      `${extracts.length - extractCacheHits} extracted via API (${extractCacheHits} cached)`,
    )

    console.log('Stage C: Scoring...')
    let scored = extracts.map((e) => scoreResume(e, jd))
    const dq = scored.filter((s) => s.disqualified).length
    console.log(`  ${scored.length - dq} qualified, ${dq} disqualified (no undergrad)`)

    if (doExplain && jd.top_n_explain > 0) {
      console.log(`Stage D: Explaining top ${jd.top_n_explain}...`)
      scored.sort((a, b) => b.total_score - a.total_score)
      const extractMap = new Map<string, ResumeExtract>(extracts.map((e) => [e.file, e]))
      scored = await explainResumes(scored, extractMap, jd, client, concurrency, verbose)
    }

    await writeResults(workspace, scored, jd)
    const sorted = [...scored].sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1
      return b.total_score - a.total_score
    })
    sorted.forEach((s, i) => (s.rank = i + 1))
    printTopN(sorted)

    console.log(`\nOutput written to ${path.join(workspace, 'output')}/`)
    console.log('  shortlist.csv — sortable ranked list')
    console.log(`  report.md     — full rationale for top ${jd.top_n_explain}`)
  })

program
  .command('extract')
  .description('Stage A+B only: parse resumes and populate cache (no JD needed)')
  .option('--workspace <path>', 'workspace directory', process.cwd())
  .option('--resumes <path>', 'path to resumes folder (default: <workspace>/resumes)')
  .option('--concurrency <n>', 'max parallel API calls', '8')
  .option('--verbose', 'show per-file progress')
  .action(async (opts) => {
    const workspace = path.resolve(opts.workspace as string)
    const resumesDir = (opts.resumes as string | undefined) ?? path.join(workspace, 'resumes')
    const concurrency = parseInt(opts.concurrency as string, 10)
    const verbose = opts.verbose as boolean ?? false

    if (!existsSync(resumesDir)) {
      console.error(`Resumes directory not found: ${resumesDir}`)
      process.exit(1)
    }

    const client = new Anthropic({ apiKey: requireApiKey() })
    const allFiles = await readdir(resumesDir)
    const resumeFiles = allFiles
      .filter((f) => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(resumesDir, f))

    if (resumeFiles.length === 0) {
      console.error(`No PDF/DOCX files found in ${resumesDir}`)
      process.exit(1)
    }

    console.log(`\nFound ${resumeFiles.length} resume(s). Extracting...`)
    const { extracts, extractCacheHits } = await parseAndExtract(
      resumeFiles, workspace, client, concurrency, verbose,
    )
    const newExtracts = extracts.length - extractCacheHits
    console.log(`\nDone. ${newExtracts} extracted via API, ${extractCacheHits} already cached.`)
    console.log('Run `score` with a jd.yaml to rank them.')
  })

program
  .command('score')
  .description('Stage C only: re-score cached extractions against jd.yaml (instant, no API cost)')
  .option('--workspace <path>', 'workspace directory', process.cwd())
  .option('--jd <path>', 'path to jd.yaml (default: <workspace>/jd.yaml)')
  .action(async (opts) => {
    const workspace = path.resolve(opts.workspace as string)
    const jdPath = (opts.jd as string | undefined) ?? path.join(workspace, 'jd.yaml')

    if (!existsSync(jdPath)) {
      console.error(`JD file not found: ${jdPath}`)
      process.exit(1)
    }

    const jd = await loadJD(jdPath)
    const cached = await listCachedExtracts(workspace)
    if (cached.length === 0) {
      console.error('No cached extractions found. Run `extract` first.')
      process.exit(1)
    }

    console.log(`\nScoring ${cached.length} cached resume(s) against "${jd.title}"...`)
    const extracts = cached.map((c) => ResumeExtractSchema.parse(c))
    const scored = extracts.map((e) => scoreResume(e, jd))
    const dq = scored.filter((s) => s.disqualified).length
    console.log(`  ${scored.length - dq} qualified, ${dq} disqualified`)

    await writeResults(workspace, scored, jd)
    const sorted = [...scored].sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1
      return b.total_score - a.total_score
    })
    sorted.forEach((s, i) => (s.rank = i + 1))
    printTopN(sorted)
    console.log(`\nUpdated output in ${path.join(workspace, 'output')}/`)
  })

program
  .command('explain')
  .description('Stage D only: generate narratives for top-N (reads output/results.json)')
  .option('--workspace <path>', 'workspace directory', process.cwd())
  .option('--jd <path>', 'path to jd.yaml (default: <workspace>/jd.yaml)')
  .option('--concurrency <n>', 'max parallel API calls', '8')
  .option('--verbose', 'show per-candidate progress')
  .action(async (opts) => {
    const workspace = path.resolve(opts.workspace as string)
    const jdPath = (opts.jd as string | undefined) ?? path.join(workspace, 'jd.yaml')
    const resultsPath = path.join(workspace, 'output', 'results.json')
    const concurrency = parseInt(opts.concurrency as string, 10)
    const verbose = opts.verbose as boolean ?? false

    if (!existsSync(resultsPath)) {
      console.error('No results.json found. Run `score` first.')
      process.exit(1)
    }
    if (!existsSync(jdPath)) {
      console.error(`JD file not found: ${jdPath}`)
      process.exit(1)
    }

    const jd = await loadJD(jdPath)
    const client = new Anthropic({ apiKey: requireApiKey() })
    const scored: ScoredResume[] = JSON.parse(await readFile(resultsPath, 'utf8'))
    const cached = await listCachedExtracts(workspace)
    const extractMap = new Map<string, ResumeExtract>(
      cached.map((c) => {
        const e = ResumeExtractSchema.parse(c)
        return [e.file, e]
      }),
    )

    console.log(`\nExplaining top ${jd.top_n_explain} candidate(s)...`)
    const explained = await explainResumes(scored, extractMap, jd, client, concurrency, verbose)
    await writeResults(workspace, explained, jd)
    console.log(`\nUpdated ${path.join(workspace, 'output', 'report.md')}`)
  })

program.parseAsync(process.argv).catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
