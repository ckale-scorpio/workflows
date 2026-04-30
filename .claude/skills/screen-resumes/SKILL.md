---
name: screen-resumes
description: Screen and rank job candidates by comparing resumes to a job description. Use whenever the user mentions screening resumes, reviewing applicants, shortlisting candidates, ranking resumes against a job posting, evaluating candidates, comparing CVs to a role, or filtering applicants. Always trigger when the user's message combines resumes/CVs/candidates with a job/role/position — even if they just say "help me hire" or "who should I interview".
---

# Resume Screener

Screens PDF and DOCX resumes against a job description, producing a ranked shortlist scored on:
- **Skill match** — required and preferred skills, weighted by how recently they were used
- **Recency** — how current is the candidate's most recent role?
- **Ownership language** — verbatim phrases showing decision-making and initiative

The pipeline has four stages. Extraction (Stage B) is cached forever per resume — adding resumes or changing the JD never re-bills the corpus. Scoring (Stage C) is instant and free. This means tweaking weights costs $0.

## One-time setup

Install the screener CLI once:

```bash
cd ~/.claude/skills/screen-resumes/screener
pnpm install
```

Ensure `ANTHROPIC_API_KEY` is set in your environment (add to `~/.zshrc` or pass inline).

## Workspace layout

Each hiring round gets its own folder anywhere on disk. Two layouts are supported:

**Flat layout** — resumes live directly alongside `jd.yaml` (simplest):
```
~/hiring/my-role/
├── jd.yaml           ← job description spec (copy template, fill in)
├── alice-smith.pdf   ← resume files dropped here
├── bob-jones.docx
├── .cache/           ← auto-generated (gitignore this)
└── output/           ← results land here
```

**Subfolder layout** — resumes in a `resumes/` subfolder (original, still supported):
```
~/hiring/my-role/
├── jd.yaml
├── resumes/          ← drop PDF and DOCX files here
├── .cache/
└── output/
```

The screener auto-detects: if a `resumes/` subfolder exists it uses that; otherwise it scans the workspace root for PDF/DOCX files.

To scaffold a new workspace:

```bash
mkdir ~/hiring/my-role
cp ~/.claude/skills/screen-resumes/references/jd-spec-template.yaml ~/hiring/my-role/jd.yaml
# drop resumes (PDF/DOCX) into ~/hiring/my-role/
# edit jd.yaml: fill in title, required_skills, preferred_skills, job_description
```

## Running

From inside the workspace folder (or any folder with `--workspace <path>`):

```bash
# Full pipeline: parse → extract → score → explain
pnpm --dir ~/.claude/skills/screen-resumes/screener screen --workspace .

# With per-file progress
pnpm --dir ~/.claude/skills/screen-resumes/screener screen --workspace . --verbose

# Skip narrative explanations (faster, no Stage D API cost)
pnpm --dir ~/.claude/skills/screen-resumes/screener screen --workspace . --no-explain
```

Output:
- `output/shortlist.csv` — sortable ranked list with all scores
- `output/report.md` — top-N with written rationale paragraphs

## Iterating (free and instant)

After the first run, changing weights or skills in `jd.yaml` and re-scoring costs nothing:

```bash
# Re-score with new weights or skills (reads from cache, no API calls)
pnpm --dir ~/.claude/skills/screen-resumes/screener score --workspace .

# Re-generate explanations only (e.g. after re-ranking)
pnpm --dir ~/.claude/skills/screen-resumes/screener explain --workspace .

# Extract only — populate cache without scoring (useful for large batches before you have a JD)
pnpm --dir ~/.claude/skills/screen-resumes/screener extract --workspace .
```

## Cache behaviour

| What changed | Command needed | API cost |
|---|---|---|
| Added new resumes | `screen` | Only new files |
| Changed weights/skills in jd.yaml | `score` | $0 |
| Changed `job_description` text | `explain` | Top-N only |
| Bumped `PROMPT_VERSION` in extract.ts | `screen` | Full re-extract |

## Scoring (jd.yaml fields)

- `required_skills` — each matched skill adds 1.0 × recency_factor
- `preferred_skills` — each matched skill adds 0.4 × recency_factor
- `recency_window_years` — skills used in jobs within this window get full weight; older jobs are down-weighted
- `weights.skills / recency / agency` — must sum to 1.0
- `must_have_undergrad` — candidates without a bachelor's degree score 0 (still shown as disqualified)
- `top_n_explain` — how many candidates get a written rationale (Stage D)

## Your workflow as Claude

1. **Ask for the folder** — prompt the user: "Which folder contains the resumes and jd.yaml?" Do not proceed until you have a path. Verify that `jd.yaml` exists in that folder and that there are PDF/DOCX files either alongside it or in a `resumes/` subfolder; if missing, scaffold from the template above.
2. **Run** — execute the `screen` command with `--workspace <folder>` (or `score` if extractions are already cached)
3. **Read results** — read `output/shortlist.csv` first 15 rows and `output/report.md` top 5
4. **Show inline** — present a brief table: rank, name, score, matched required skills, top agency phrase
5. **Offer iteration** — "want me to adjust weights, add a required skill, or tighten the recency window?"
6. **Re-score if adjusted** — if the user changes `jd.yaml`, run `score` only (free, instant) and show updated top 10
