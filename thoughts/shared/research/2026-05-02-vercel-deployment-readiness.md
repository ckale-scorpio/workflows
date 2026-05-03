---
date: 2026-05-02T21:03:57-07:00
researcher: Chetan Kale
git_commit: 07e4e3ade33459cd93e6195910087e1a3eb930b5
branch: infra
repository: workflows
topic: "Deploying the web app to Vercel — subsystem-by-subsystem map"
tags: [research, codebase, deployment, vercel, supabase, inngest, mikro-orm, build]
status: complete
last_updated: 2026-05-02
last_updated_by: Chetan Kale
---

# Research: Deploying the Web App to Vercel

**Date**: 2026-05-02T21:03:57-07:00
**Researcher**: Chetan Kale
**Git Commit**: 07e4e3ade33459cd93e6195910087e1a3eb930b5
**Branch**: infra
**Repository**: workflows

## Research Question

What is the current state of every deployment subsystem — build, Vercel config, environment variables, database/migrations, Supabase, Inngest, and CI — for deploying `apps/web` to production?

## Summary

An existing `DEPLOYING.md` at the repo root describes the end-to-end deployment procedure. The document is largely accurate but contains **stale package-name references** from before the `server→services / workflows→jobs / shared→core` rename (committed `07e4e3a`). The `biome.json` import-restriction overrides also reference old directory paths (`**/packages/server/**`) that no longer match the renamed `packages/services/` directory.

**No `vercel.json` or `.vercelignore` exists** — Vercel relies on manual settings entered in the dashboard per `DEPLOYING.md`. The deployment model is fully serverless: Next.js on Vercel, PostgreSQL via Supabase, background jobs via Inngest Cloud.

---

## Detailed Findings

### 1. Build System

**Files:** `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, `apps/web/package.json`

The monorepo uses **pnpm@10.33.0** + **Turborepo**. Node ≥ 22 is required (enforced in root `package.json` `engines` field; CI reads `.nvmrc` which contains `22`).

**Turbo pipeline (`turbo.json`)**:
- `build` — `dependsOn: ["^build"]` (topological: all workspace deps build first). Outputs: `.next/**` (excluding `.next/cache/**`) and `dist/**`. 
- `globalDependencies: ["**/.env", "**/.env.*"]` — any env file change invalidates all Turbo caches.
- No `@app/web`-specific pipeline override; it inherits the global `build` task.

**Workspace packages (`pnpm-workspace.yaml`)**:
```
packages:
  - "apps/*"
  - "packages/*"
ignoredBuiltDependencies:
  - sharp
  - unrs-resolver
```

**Web app build script (`apps/web/package.json`)**:
```
"build": "next build"
```
Turbo calls this after all workspace dependencies (`@app/collab`, `@app/core`, `@app/jobs`, `@app/services`) have been built.

**Root package.json name**: `react-app` (not the repo name). This is also the Inngest client app ID (see §5).

**No `vercel.json` or `.vercelignore`** found anywhere in the repo. Vercel settings are configured manually per the dashboard (see §2).

**`next.config.ts` (`apps/web/next.config.ts`)**:
```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    preloadEntriesOnStart: false,
    serverComponentsHmrCache: true,
  },
};
```
No custom output mode, no `transpilePackages`, no `serverExternalPackages` configured.

---

### 2. Vercel Project Configuration

**Source:** `DEPLOYING.md` (manual dashboard settings — not in a `vercel.json`)

| Setting | Value |
|---------|-------|
| Root directory | `apps/web` |
| Framework preset | Next.js |
| Build command | `cd ../.. && pnpm --filter @app/web build` |
| Install command | `cd ../.. && pnpm install --frozen-lockfile` |

The `cd ../..` is necessary because Vercel sets the working directory to `apps/web` (the root directory), but pnpm workspaces and the lockfile live two levels up at the repo root.

`DEPLOYING.md` specifies the first-deploy sequence:
1. Push to `main` (CI passes)
2. Vercel builds and deploys — note the production URL
3. Register the Inngest sync endpoint: `https://<prod-url>/api/inngest`
4. Run migrations: `DATABASE_URL=... pnpm --filter @app/db db:migrate`
5. Apply RLS policies (manual — no policy files in repo, see §4)
6. Smoke test: sign up a user, trigger a test event from Inngest dashboard

**Stale reference in `DEPLOYING.md`**: The "Architectural boundary" section at the bottom references `@app/server` and `packages/server/src/services/` — these directories and package names were renamed to `@app/services` and `packages/services/` in commit `07e4e3a`.

---

### 3. Environment Variables

**Source:** `packages/core/src/env.ts` (Zod-validated via `@t3-oss/env-nextjs`), `.env.example`

**Validation logic**: `skipValidation: process.env.SKIP_ENV_VALIDATION === '1'` — validation can be bypassed in CI.
`emptyStringAsUndefined: true` — empty strings are treated as absent.

#### Server-side variables (never sent to browser)

| Variable | Required | Source | Notes |
|----------|----------|--------|-------|
| `ANTHROPIC_API_KEY` | **Yes** (`z.string().min(1)`) | Anthropic console | Used by `packages/jobs/src/client.ts` |
| `DATABASE_URL` | **Yes** (`z.string().url()`) | Supabase pooler | **Session mode** pooler URI — NOT transaction mode (MikroORM requires session for prepared statements) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase dashboard | Used for realtime HTTP broadcast and admin operations |
| `INNGEST_EVENT_KEY` | Optional | Inngest Cloud | Required in production for secure event sending |
| `INNGEST_SIGNING_KEY` | Optional | Inngest Cloud | Required in production for webhook signature verification |
| `STRIPE_SECRET_KEY` | Optional | Stripe dashboard | Invoice workflow (not yet wired to real Stripe) |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe dashboard | Stripe webhook verification |

#### Client-side variables (included in browser bundle, `NEXT_PUBLIC_` prefix)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anon (public) key |
| `NEXT_PUBLIC_APP_URL` | Optional | Defaults to `http://localhost:3000`; set to production URL (e.g. `https://app.example.com`) |

**CI placeholder values** (from `.github/workflows/ci.yml`): CI sets `ANTHROPIC_API_KEY=sk-ant-placeholder`, `DATABASE_URL=postgresql://user:pass@localhost:5432/db`, `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key`. The remaining optional vars are left unset (Zod schema accepts their absence).

---

### 4. Database — MikroORM + Migrations

**Files:** `packages/db/`, `packages/services/src/context.ts`

**ORM:** MikroORM 6.x with PostgreSQL adapter. Config: `packages/db/src/mikro-orm.config.ts`.

**Connection:** reads `process.env.DATABASE_URL`. Throws at startup if absent. `forceUtcTimezone: true`. `allowGlobalContext: false` (all DB calls must use a forked EntityManager).

**Migration commands** (run from repo root or with `pnpm --filter @app/db`):

| Command | What it does |
|---------|-------------|
| `pnpm --filter @app/db db:migrate` | `mikro-orm migration:up` — runs all pending migrations |
| `pnpm --filter @app/db db:generate` | `mikro-orm migration:create` — generates a new migration from entity diffs |
| `pnpm --filter @app/db db:rollback` | `mikro-orm migration:down` — reverts the last migration |
| `pnpm --filter @app/db db:reset` | Drops all tables/enums, re-runs all migrations (runs `src/scripts/reset.ts`) |

**Migrations present** (`packages/db/migrations/`):

| File | Date | What it creates |
|------|------|-----------------|
| `Migration20260421051047.ts` | 2026-04-21 | Enums (`invoice_status`, `payment_attempt_status`, `failure_category`), tables: `profiles`, `invoices`, `payment_attempts`, `workflow_runs` |
| `Migration20260421_drop_workflow_runs.ts` | 2026-04-21 | Drops `workflow_runs` table |
| `Migration20260422_add_documents.ts` | 2026-04-22 | Tables: `documents`, `document_members`, `document_operations` |
| `Migration20260423_profile_trigger.ts` | 2026-04-23 | PL/pgSQL function `handle_new_user()` + trigger `on_auth_user_created` on `auth.users` → copies new Supabase auth user into `profiles` table |

The profile trigger (migration 4) is the bridge between Supabase Auth and the app's `profiles` table — every new sign-up automatically creates a profile row.

**Entities** (6 total in `packages/db/src/entities/`):
- `Profile` — user + Stripe customer ID
- `Invoice` — billing record
- `PaymentAttempt` — per-attempt charge log with agent fields (`agentReasoning`, `agentModel`)
- `Document` — collaborative document with JSONB `content` (Slate format)
- `DocumentMember` — user ↔ document membership (unique per pair, max 2 enforced in service layer)
- `DocumentOperation` — OT op log with unique `(document, serverRev)` constraint

**Context helpers** (`packages/services/src/context.ts`):
- `withServerContext(fn)` — forks EntityManager, executes, flushes, then clears
- `withTransactionalContext(fn)` — wraps in `em.transactional()` for PESSIMISTIC_WRITE row locks (used by the ops route)

**No RLS policies** are stored as SQL files in the repo. `DEPLOYING.md` notes: "Apply RLS policies via Supabase SQL editor or a migration."

---

### 5. Inngest

**Files:** `packages/jobs/src/`, `apps/web/app/api/inngest/route.ts`

**Inngest client** (`packages/jobs/src/client.ts`):
```typescript
export const inngest = new Inngest({
  id: 'react-app',
  schemas: new EventSchemas().fromRecord<InvoiceEvents>(),
});
```
App ID is `react-app` (matches root `package.json` `name` field).

**Functions registered** (`packages/jobs/src/functions.ts`):
```typescript
export const functions = [payInvoice];
```
One function: `pay-invoice` (event: `invoice/payment.requested`).

**Event types** (`packages/jobs/src/events.ts`):

| Event name | Data fields |
|------------|-------------|
| `invoice/payment.requested` | `invoiceId` (uuid), `idempotencyKey` (string) |
| `stripe/payment_intent.succeeded` | `paymentIntentId`, `invoiceId` (uuid) |
| `invoice/customer.updated_payment` | `invoiceId` (uuid), `customerId` (uuid) |
| `invoice/paid` | `invoiceId` |
| `invoice/payment.failed` | `invoiceId`, `reason` |
| `invoice/fraud.review_needed` | `invoiceId`, `paymentAttemptId` |

**Webhook route** (`apps/web/app/api/inngest/route.ts`):
```typescript
export const { GET, POST, PUT } = serve({ client: inngest, functions });
```
No explicit `runtime` export — defaults to **Node.js** runtime. Route path: `/api/inngest`.

**Production setup**: Register the sync URL (`https://<prod-url>/api/inngest`) in Inngest Cloud after first deploy. Inngest introspects and lists `pay-invoice`. `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` must be set in Vercel env vars.

**Anthropic models used** (inside `packages/jobs/src/client.ts`):
- `MODEL.default = 'claude-sonnet-4-6'`
- `MODEL.hardReasoning = 'claude-opus-4-7'`

---

### 6. Supabase Integration

**Files:** `apps/web/lib/supabase/`, `apps/web/proxy.ts`, `supabase/config.toml`

**Supabase features in use:**

| Feature | Where |
|---------|-------|
| Email/password auth | `apps/web/app/login/` server action |
| Session refresh middleware | `apps/web/proxy.ts` → `lib/supabase/proxy.ts` |
| Server Component client (cookies) | `lib/supabase/server.ts` — all API routes |
| Browser client (realtime subscribe) | `lib/supabase/client.ts` — `CollabEditor.tsx` |
| Admin client (HTTP broadcast) | `lib/supabase/admin.ts` — `[docId]/ops/route.ts` |
| Realtime HTTP broadcast | `[docId]/ops/route.ts` POSTs to `/realtime/v1/api/broadcast` |

**Auth flow:**
- `proxy.ts` at the web app root is the Edge middleware entry point (not `middleware.ts` — there is no `middleware.ts` file).
- Matcher excludes `_next/static`, `_next/image`, favicon, and image file extensions.
- `/app/*` routes are protected; unauthenticated requests redirect to `/login?next=<path>`.
- `/login` and `/signup` redirect authenticated users to `/app`.

**Realtime broadcast (collaborative editing):**
Server (`[docId]/ops/route.ts`) uses HTTP rather than WebSocket:
```
POST ${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast
Authorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}
Topic: realtime:doc:{docId}
Event: op
```
Client (`CollabEditor.tsx`) subscribes via `supabase.channel('doc:${docId}').on('broadcast', { event: 'op' }, ...)`.

**Local Supabase config** (`supabase/config.toml`):
- DB port: 54322, API port: 54321, Studio: 54323
- PostgreSQL 17
- Auth: JWT expiry 3600s, email confirmations disabled, anonymous sign-in disabled
- No OAuth providers configured
- No seed.sql file exists (config references `./seed.sql` but file is absent)

---

### 7. API Routes

All 5 route handlers live under `apps/web/app/api/`. None declare `export const runtime` — all default to **Node.js runtime**.

| Route | Methods | Auth |
|-------|---------|------|
| `/api/inngest` | GET, POST, PUT | None (Inngest webhook) |
| `/api/docs` | POST | Supabase user auth (401 if missing) |
| `/api/docs/[docId]` | GET | Supabase user auth |
| `/api/docs/[docId]/join` | POST | Supabase user auth + 409 if doc full |
| `/api/docs/[docId]/ops` | POST | Supabase user auth + 403 if not a doc member |

---

### 8. CI Pipeline

**File:** `.github/workflows/ci.yml`

- Triggers: push to `main`, all pull requests
- Concurrency: cancels in-progress runs for the same ref
- Node version: reads from `.nvmrc` (currently `22`)
- Steps: `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` → `build`
- `pnpm lint` runs `biome check .` from root (see §9 for stale path issue)

Build step env vars in CI: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (all placeholder values). `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and Stripe vars are left unset (all declared `.optional()` in `env.ts`).

---

### 9. Biome Import Restrictions — Stale Path Reference

**File:** `biome.json`

The `noRestrictedImports` rule (base config) blocks `@app/db`, `@app/db/*`, `@mikro-orm/core`, `@mikro-orm/postgresql` project-wide with error level.

The exception override:
```json
{
  "includes": ["**/packages/server/**", "**/packages/db/**"],
  "linter": { "rules": { "style": { "noRestrictedImports": "off" } } }
}
```

This override uses the **old directory path** `**/packages/server/**`. After the rename to `packages/services/`, this pattern no longer matches. `packages/services/` imports `@app/db` and `@mikro-orm/*` directly — meaning `pnpm lint` currently reports errors for those imports in `packages/services/`.

The error message text in the rule also reads: *"Database access must go through `@app/server`"* — the old package name.

The second override (blocking `@app/server` import in `packages/collab/**`) references the old package name but is effectively inert since `@app/collab` has zero workspace imports.

---

## Code References

- `DEPLOYING.md` — Full deployment procedure (contains stale `@app/server` / `packages/server` refs)
- `.env.example` — Environment variable template
- `packages/core/src/env.ts` — Zod-validated env schema (required vs optional)
- `turbo.json` — Build pipeline config
- `apps/web/next.config.ts` — Next.js config
- `apps/web/tsconfig.json` — Web app TypeScript config
- `tsconfig.base.json` — Shared base TypeScript config (ES2022, strict)
- `packages/db/src/mikro-orm.config.ts` — ORM config (DATABASE_URL, migrations path)
- `packages/db/migrations/` — 4 migrations (latest: profile trigger for auth sync)
- `packages/services/src/context.ts` — `withServerContext` / `withTransactionalContext`
- `packages/jobs/src/client.ts` — Inngest client + Anthropic client setup
- `packages/jobs/src/functions.ts` — `[payInvoice]` functions array
- `packages/jobs/src/events.ts` — 6 typed Inngest event schemas
- `apps/web/app/api/inngest/route.ts` — Inngest `serve()` handler
- `apps/web/app/api/docs/[docId]/ops/route.ts` — OT handler + Supabase realtime broadcast
- `apps/web/proxy.ts` — Edge middleware entry point (session refresh + route protection)
- `apps/web/lib/supabase/proxy.ts` — Auth middleware logic
- `supabase/config.toml` — Local Supabase CLI config
- `biome.json` — Import restrictions (noRestrictedImports overrides use stale paths)
- `.github/workflows/ci.yml` — lint → typecheck → test → build

## Architecture Documentation

```
Vercel (apps/web)
  ├─ Next.js App Router (Node.js runtime for all routes)
  ├─ Edge middleware: proxy.ts → lib/supabase/proxy.ts
  │   └─ Session refresh + /app/* protection
  ├─ API routes (5 handlers)
  │   ├─ /api/inngest        → Inngest Cloud webhook
  │   ├─ /api/docs           → @app/services (create doc)
  │   ├─ /api/docs/[docId]   → @app/services (load doc)
  │   ├─ /api/docs/[docId]/join → @app/services (join doc)
  │   └─ /api/docs/[docId]/ops  → @app/services + @app/collab + Supabase Realtime broadcast
  └─ Workspace deps (built by Turbo before Next.js build)
      ├─ @app/collab    — OT algorithm + Slate types
      ├─ @app/core      — env validation + Money type
      ├─ @app/jobs      — Inngest functions + Anthropic agents
      │   └─ imports @app/services
      └─ @app/services  — ORM context + domain services
          └─ imports @app/db

Supabase
  ├─ Auth (email/password, JWT, session cookies)
  ├─ Realtime (broadcast channel per document)
  └─ PostgreSQL (via MikroORM, session-mode pooler)
      └─ 4 migrations applied (profile trigger bridges auth.users → profiles)

Inngest Cloud
  └─ Registered at /api/inngest
      └─ pay-invoice function (6 event types)

Anthropic API
  └─ Used inside @app/jobs (dispute-classifier + dunning-drafter agents)
```

## Related Research

- `thoughts/shared/research/2026-04-29-package-structure-audit.md` — Package naming audit that preceded the rename

## Open Questions

- No RLS policies are stored as SQL files or migrations — the deployment doc says to apply them via Supabase SQL editor.
- `supabase/config.toml` references `./seed.sql` but the file does not exist.
- `biome.json` import-restriction overrides reference `**/packages/server/**` (old path) and `@app/server` (old package name) — `pnpm lint` may currently fail for `packages/services/`.
- Vercel project settings (root directory, build/install commands) exist only in `DEPLOYING.md` prose — not encoded in a `vercel.json` file.
- The `proxy.ts` Edge middleware entry point is named `proxy.ts` rather than the Next.js standard `middleware.ts` — the mechanism by which Next.js picks it up is not immediately obvious from the file name alone.
