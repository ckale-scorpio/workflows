# workflows

> *Agentic workflows for B2B SaaS — packaged as a web app, a set of Claude Code skills, and runnable CLIs.*

A working library of the recurring workflows every B2B SaaS team ends up rebuilding: invoice collection with AI-drafted dunning, bulk résumé screening for a hiring round, A/B experiment specs that don't drift, and a collaborative text editor primitive you can plug into a CRM or shared doc surface. Each workflow ships in the format that fits it best — a Next.js route, a Claude Code skill with a CLI, or a slash command — so you can run one locally tonight, fork another into your own product, or deploy the whole thing to Vercel.

Skip to: [Quick start](#getting-started) · [What's inside](#whats-in-the-box-today) · [Contributing](#contributing) · [Deploying](DEPLOYING.md)

## Why this exists

Every B2B SaaS team hits the same handful of workflows. Customers need their invoices collected on without going to legal. Hiring managers need to triage 200 résumés without paying a recruiter. Product teams need experiments that don't end in arguments about what the hypothesis was. Internal tools need a shared text surface that handles two people typing into the same paragraph. Each of these has a "right way" — clear hypotheses, escalating dunning tone, recency-weighted skill scoring, operational transforms — that's painful to reinvent every time.

This repo collects working implementations in three delivery formats so the right format fits the workflow:

- **Web app routes** — for customer-facing flows that need a UI (collaborative docs; dunning surfaces in the future)
- **Claude Code skills with embedded CLIs** — for ops/internal flows that benefit from running locally with agentic capabilities (résumé screener)
- **Slash commands** — for lightweight, repo-anchored authoring templates (A/B experiment specs)

## What's in the box (today)

Honest inventory. Sections marked **Partial** call out what's wired up versus what's still on the doc-only side.

### 1. Invoice payment workflow with AI dunning

[`packages/workflows/src/invoices/`](packages/workflows/src/invoices/)

- Inngest orchestration: up-to-3-attempt charge with exponential backoff and idempotency keys
- Two Claude agents: [`dispute-classifier.ts`](packages/workflows/src/invoices/agents/dispute-classifier.ts) (categorizes failures as retryable / needs-customer-action / fraud / permanent) and [`dunning-drafter.ts`](packages/workflows/src/invoices/agents/dunning-drafter.ts) (drafts collection emails with escalating tone across attempts)
- Event-driven: `invoice/payment.requested` → `invoice/paid` | `invoice/payment.failed` | `invoice/fraud.review_needed`
- **Partial:** workflow runs server-side via the Inngest webhook; no customer-facing UI yet

### 2. Collaborative text editor (Slate + Jupiter OT)

[`packages/collab/`](packages/collab/) + [`apps/web/app/app/editor/`](apps/web/app/app/editor/)

- Operational-transform engine in [`doc.ts`](packages/collab/src/doc.ts) and [`transform.ts`](packages/collab/src/transform.ts) (Jupiter algorithm — manual OT, not Yjs/Automerge)
- Slate adapter [`slate-adapter.ts`](packages/collab/src/slate-adapter.ts) exposes a `useDoc()` React hook
- Server linearizes incoming ops with `SELECT FOR UPDATE` ([`ops/route.ts`](apps/web/app/api/docs/%5BdocId%5D/ops/route.ts)) and broadcasts to peers via Supabase Realtime HTTP — stateless, no persistent WebSocket
- **Partial:** Phase 1 scope is a single paragraph / single text node. The primitive is in place; richer schemas are next. A CRM-shaped workflow could plug directly into this surface.

### 3. Résumé screener skill

[`.claude/skills/screen-resumes/`](.claude/skills/screen-resumes/)

- Four-stage pipeline (parse → extract → score → explain) with per-résumé extraction cache, so iterating on the JD weights costs nothing after the first run
- `screener` CLI accepts a folder containing `jd.yaml` + PDFs/DOCXs (flat layout) or a `resumes/` subfolder
- Aimed at hiring managers who don't have recruiter budget for a one-off round

```bash
cd .claude/skills/screen-resumes/screener && pnpm install
ANTHROPIC_API_KEY=... pnpm screen --workspace ~/hiring/my-role
```

### 4. A/B experiment specs

[`experiments/`](experiments/) + [`.claude/commands/`](.claude/commands/)

- Markdown specs with YAML frontmatter (status, hypotheses, baseline, guardrails), validated by [`experiments/scripts/`](experiments/scripts/)
- [`/specify_experiment`](.claude/commands/specify_experiment.md) — interactive authoring that enforces metric-specific, directional, quantified, time-bound hypotheses
- [`/list_experiments`](.claude/commands/list_experiments.md) — status grouping (Proposed / Approved / In Progress / Paused / Completed / Cancelled)
- **Partial:** specs and process only — no runtime feature-flag wiring yet

## Architecture at a glance

- **Monorepo:** pnpm + Turborepo, Node 22 (`.nvmrc`)
- **App:** [`apps/web`](apps/web/) — Next.js 16 (Turbopack) + React 19 + Tailwind v4 + shadcn / Base UI; Supabase Auth via `@supabase/ssr`
- **Packages:**
  - [`@app/db`](packages/db/) — MikroORM v6 + PostgreSQL; entities for Profile / Invoice / PaymentAttempt / Document / DocumentMember / DocumentOperation; explicit `.ts` migrations
  - [`@app/server`](packages/server/) — service layer over `@app/db`; exposes `withServerContext` and `withTransactionalContext`
  - [`@app/workflows`](packages/workflows/) — Inngest client + Claude agents (`@inngest/agent-kit`, `@anthropic-ai/sdk`); models pinned in [`client.ts`](packages/workflows/src/client.ts) to `claude-sonnet-4-6` (default) and `claude-opus-4-7` (hard reasoning)
  - [`@app/shared`](packages/shared/) — `@t3-oss/env-nextjs` env validation + money utilities
  - [`@app/collab`](packages/collab/) — OT engine + Slate adapter (peer-deps React/Slate)
- **Skills:** `.claude/skills/<name>/` symlinked into `~/.claude/skills/<name>` for global Claude Code discovery — convention documented in [CLAUDE.md](CLAUDE.md)

**Architectural boundaries** (enforced by Biome in [`biome.json`](biome.json)):

- `@app/db`, `@mikro-orm/core`, `@mikro-orm/postgresql` may only be imported from `@app/db` and `@app/server`. Everything else routes through service functions.
- `@app/collab` may not import `@app/server` — keeps the editor primitive platform-free.

## Repo layout

```
.
├── apps/web/                  # Next.js app (App Router, Turbopack)
├── packages/
│   ├── db/                    # MikroORM + entities + migrations
│   ├── server/                # Service layer (the only place that imports @app/db)
│   ├── workflows/             # Inngest functions + Claude agents
│   ├── shared/                # Env validation, money utils
│   └── collab/                # Operational-transform editor
├── .claude/
│   ├── skills/screen-resumes/ # Résumé screener (with embedded CLI)
│   ├── commands/              # Slash commands (specify_experiment, list_experiments)
│   └── settings.json          # Claude Code permission allowlist
├── experiments/               # A/B experiment specs + validation scripts
├── supabase/                  # Local Supabase config (ports 54321–54324)
├── .github/workflows/ci.yml   # Lint → Typecheck → Test → Build
├── DEPLOYING.md               # Production deploy runbook
├── turbo.json                 # Turborepo task graph
└── biome.json                 # Lint/format + architectural rules
```

## Getting started

**Prerequisites:** Node 22 (use `nvm use`), pnpm ≥ 10.33, the [Supabase CLI](https://supabase.com/docs/guides/cli), and an [Anthropic API key](https://console.anthropic.com/).

```bash
pnpm install
cp .env.example .env.local              # fill in the keys you need
supabase start                          # local Postgres + Auth (ports 54321–54324)
pnpm --filter @app/db db:migrate
pnpm dev                                # Next.js on :3000

# In a separate terminal:
pnpm dlx inngest-cli@latest dev         # Inngest dev server on :8288
```

The Inngest dev server is only needed when you're working on workflow code in `@app/workflows`.

## Build, test, lint

| Command | What it does |
|---|---|
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` / `pnpm lint:fix` | Biome — formatting + architectural rules |
| `pnpm test` | Vitest across all packages |
| `pnpm --filter @app/web test:e2e` | Playwright e2e |
| `pnpm build` | Turbo: builds Next.js + all package `dist/` outputs |
| `pnpm --filter @app/db db:generate` | Generate a new MikroORM migration |
| `pnpm --filter @app/db db:migrate` | Apply pending migrations |
| `pnpm --filter @app/db db:rollback` | Roll back the most recent migration |
| `pnpm --filter @app/db db:reset` | Reset local DB (destructive) |

## CI & deploy

- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint → typecheck → test → build on every push to `main` and every PR. The build step provides placeholder env values because Turbopack worker threads don't inherit `SKIP_ENV_VALIDATION` from the workflow-level env.
- **Hosting:** Vercel deploys `apps/web` on `main`. Vercel project root is `apps/web`; build command is `cd ../.. && pnpm --filter @app/web build`.
- **Inngest:** register the prod webhook at `https://<prod-url>/api/inngest`.
- **DB migrations:** run `pnpm --filter @app/db db:migrate` against the prod `DATABASE_URL` (must be a session-mode pooler URI — MikroORM requires session, not transaction-mode).
- Full runbook with the env-var matrix: [DEPLOYING.md](DEPLOYING.md).

## Contributing

**Conventions:**

- All DB access goes through `@app/server` services. Don't import `@app/db` or the raw ORM elsewhere — Biome will fail the build.
- Use the server context pattern: `withServerContext(async (ctx) => …)` or `withTransactionalContext(...)`.
- Format with Biome (2-space indent, single quotes, 100-char width — already configured in [`biome.json`](biome.json)).

**Adding a new Claude Code skill:**

```bash
mkdir -p .claude/skills/my-skill
# author .claude/skills/my-skill/SKILL.md (frontmatter: name, description)
ln -s "$(pwd)/.claude/skills/my-skill" ~/.claude/skills/my-skill
```

If your skill ships a CLI, scaffold it under `<skill>/<cli-folder>/` with its own `package.json`. Skill-internal `node_modules/` and `.cache/` are gitignored — commit everything else.

**Adding a new slash command:** drop `<name>.md` into [`.claude/commands/`](.claude/commands/). Claude Code picks it up automatically when run from the repo.

**Adding a new workflow:**

1. Define the event schema in [`packages/workflows/src/events.ts`](packages/workflows/src/events.ts) (Zod).
2. Implement the Inngest function under `packages/workflows/src/<domain>/`.
3. Re-export through [`packages/workflows/src/functions.ts`](packages/workflows/src/functions.ts).
4. For LLM steps, default to `MODEL.default` (`claude-sonnet-4-6`); reach for `MODEL.hardReasoning` (`claude-opus-4-7`) only when you need it.

**Adding a DB entity:** add the entity under [`packages/db/src/entities/`](packages/db/src/entities/), generate a migration with `pnpm --filter @app/db db:generate`, and expose service functions through [`packages/server/src/services/`](packages/server/src/services/).

## License

MIT — see [LICENSE](LICENSE).
