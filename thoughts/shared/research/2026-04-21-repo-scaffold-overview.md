---
date: 2026-04-21T00:00:00-07:00
researcher: chetan
git_commit: 4341e84
branch: infra
repository: workflows
topic: "What have we built in this repo?"
tags: [research, codebase, scaffold, monorepo, next, mikro-orm, inngest, supabase]
status: complete
last_updated: 2026-04-21
last_updated_by: chetan
---

# Research: What have we built in this repo?

**Date**: 2026-04-21
**Researcher**: chetan
**Git Commit**: 4341e84
**Branch**: infra
**Repository**: workflows

## Research Question
What have we built in this repo?

## Summary

`workflows` is a pnpm + Turborepo monorepo scaffolded for a full-stack TypeScript app with durable, agent-embedded workflows. It contains one Next.js 16 web app and four workspace packages (`@app/db`, `@app/server`, `@app/workflows`, `@app/shared`). The business domain modeled so far is **invoice payment** — a Profile/Invoice/PaymentAttempt schema, a service layer over MikroORM, and an Inngest workflow `pay-invoice` that drives a retry/dunning/fraud-review state machine with two Claude agents (dispute classifier, dunning drafter). The Next.js app itself is still boilerplate (home page + shadcn Button only), wired up to Supabase auth via middleware and to Inngest via `/api/inngest`. No business UI exists yet; the workflow's Stripe calls are stubbed.

An architectural boundary is enforced by Biome's `noRestrictedImports`: only `@app/db` and `@app/server` may import MikroORM or `@app/db` itself — everything else must go through the service layer.

## Detailed Findings

### Monorepo & tooling (root)

- [pnpm-workspace.yaml](pnpm-workspace.yaml) includes `apps/*` and `packages/*`.
- [turbo.json](turbo.json) — pipeline with `build`, `dev` (persistent, no cache), `typecheck`, `test`, `lint`, `clean`; env files treated as global dependencies so changes bust caches.
- [tsconfig.base.json](tsconfig.base.json) — strict mode, `noUncheckedIndexedAccess`, bundler module resolution, ES2022 target, `jsx: preserve`.
- [biome.json](biome.json) — Biome 2.4.12. Linter + formatter + import-organizer. The key rule is `noRestrictedImports` at [biome.json:43-53](biome.json) blocking `@app/db`, `@app/db/*`, `@mikro-orm/core`, `@mikro-orm/postgresql`. Override at [biome.json:66-77](biome.json) exempts `packages/server/**` and `packages/db/**`.
- [package.json](package.json) — root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:migrate`, `db:generate`, `db:rollback`, `db:reset` (all DB scripts wrap through `dotenv -e .env.local --override --` to load env from the workspace root).
- [DEPLOYING.md](DEPLOYING.md) — Vercel + Supabase + Inngest + Anthropic setup, required env vars, first-deploy checklist, local dev commands, and a written-out statement of the DB boundary.
- [.env.example](.env.example) — template listing every env var the app reads.
- [supabase/config.toml](supabase/config.toml) — local Supabase stack config (API :54321, DB :54322, Studio :54323, Inbucket :54324, Analytics :54327). `[db.migrations]` is enabled but migrations are authored in MikroORM under `packages/db/migrations`, not Supabase SQL.

### `apps/web` — Next.js 16 app

Minimal scaffold — the app-shell exists but there is no business UI yet.

- [apps/web/package.json](apps/web/package.json) — Next 16.2.4, React 19.2.4, `@supabase/ssr`, `@supabase/supabase-js`, `inngest`, `@base-ui/react`, shadcn 4.3.1, Tailwind 4, Playwright, Vitest. Depends on workspace packages `@app/server`, `@app/shared`, `@app/workflows`.
- Routes:
  - [apps/web/app/page.tsx](apps/web/app/page.tsx) — home "/" (create-next-app template).
  - [apps/web/app/layout.tsx](apps/web/app/layout.tsx) — root layout with Geist fonts.
  - [apps/web/app/api/inngest/route.ts](apps/web/app/api/inngest/route.ts) — exports GET/POST/PUT via `serve({ client: inngest, functions })` from `inngest/next`, wired to `@app/workflows`.
- Supabase wiring:
  - [apps/web/lib/supabase/client.ts](apps/web/lib/supabase/client.ts) — `createSupabaseBrowserClient()` using `NEXT_PUBLIC_*` vars from `@app/shared/env`.
  - [apps/web/lib/supabase/server.ts](apps/web/lib/supabase/server.ts) — `createSupabaseServerClient()` using `next/headers` cookies.
  - [apps/web/lib/supabase/proxy.ts](apps/web/lib/supabase/proxy.ts) — `updateSession()` reads cookies, calls `supabase.auth.getUser()`, redirects unauthenticated `/app/*` hits to `/login?next=...` and authenticated hits to `/login` or `/signup` back to `/app`. Reads `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` directly from `process.env` (Edge Runtime doesn't expose server-only vars).
  - [apps/web/proxy.ts](apps/web/proxy.ts) — Next 16 middleware entry point delegating to `updateSession`; matcher excludes static assets and images.
- UI: [apps/web/components/ui/button.tsx](apps/web/components/ui/button.tsx) — shadcn Button built on `@base-ui/react/button` + CVA. No other components yet.
- Styling: [apps/web/app/globals.css](apps/web/app/globals.css) — Tailwind 4 with OkLCH light/dark palettes and shadcn tokens (sidebar, chart-1..5, radii).
- Testing:
  - [apps/web/playwright.config.ts](apps/web/playwright.config.ts) — Chromium only, auto-starts `pnpm dev`, 2 CI retries.
  - [apps/web/e2e/smoke.spec.ts](apps/web/e2e/smoke.spec.ts) — one test asserting the landing page has a non-empty title.
  - [apps/web/vitest.config.ts](apps/web/vitest.config.ts) — jsdom, no unit tests yet.

### `packages/db` — MikroORM layer

- [packages/db/src/mikro-orm.config.ts](packages/db/src/mikro-orm.config.ts) — lazy `loadConfig()` factory (throws only when called) reads `DATABASE_URL`, registers entities, schema `public`, Migrator with TS migrations at `./migrations`, `allowGlobalContext: false`, `forceUtcTimezone: true`, snapshot off.
- [packages/db/src/orm.ts](packages/db/src/orm.ts) — singleton `getOrm()` / `closeOrm()`.
- Entities (EntitySchema, not decorators):
  - [packages/db/src/entities/Profile.ts](packages/db/src/entities/Profile.ts) — `profiles` table: id (uuid PK), email, fullName, stripeCustomerId (unique), createdAt, updatedAt.
  - [packages/db/src/entities/Invoice.ts](packages/db/src/entities/Invoice.ts) — `invoices`: id, customer (M:1 Profile, restrict), amountCents (bigint), currency, `invoice_status` native enum (draft/pending/paid/failed/cancelled/refunded), dueAt, stripeInvoiceId (unique), metadata (jsonb), timestamps.
  - [packages/db/src/entities/PaymentAttempt.ts](packages/db/src/entities/PaymentAttempt.ts) — `payment_attempts`: id, invoice (M:1 Invoice, cascade), attemptNumber, `payment_attempt_status` enum, stripePaymentIntentId, declineCode, `failure_category` enum (retryable/needs_customer_action/fraud_suspected/permanent/unknown), agentReasoning (text), agentModel, error (jsonb), startedAt, completedAt.
  - [packages/db/src/entities/index.ts](packages/db/src/entities/index.ts) — exports all three + `entities` array.
- Migrations:
  - [packages/db/migrations/Migration20260421051047.ts](packages/db/migrations/Migration20260421051047.ts) — creates the three enums and four tables (profiles, invoices, payment_attempts, workflow_runs).
  - [packages/db/migrations/Migration20260421_drop_workflow_runs.ts](packages/db/migrations/Migration20260421_drop_workflow_runs.ts) — drops `workflow_runs` (removed as a premature optimization; Inngest owns execution state).
- Scripts: [packages/db/src/scripts/reset.ts](packages/db/src/scripts/reset.ts) — drops all public tables + enum types, closes ORM, then shells out to `tsx ./node_modules/@mikro-orm/cli/cli.js migration:up`.
- CLI scripts in [packages/db/package.json](packages/db/package.json): `db:generate`, `db:migrate`, `db:rollback`, `db:reset` (all invoke MikroORM CLI via `tsx`; `ts-node` is also in devDeps to satisfy the CLI's config-path check).

### `packages/server` — service layer boundary

All DB mutations go here. Each service takes `ServerContext` as its first argument.

- [packages/server/src/context.ts](packages/server/src/context.ts) — `ServerContext { em: EntityManager }` and `withServerContext<T>(fn)` that forks the em, runs `fn`, `em.flush()`, then clears in `finally`.
- [packages/server/src/services/profiles.ts](packages/server/src/services/profiles.ts) — `findProfile`, `findProfileByEmail`, `upsertProfile({ id, email, fullName?, stripeCustomerId? })`.
- [packages/server/src/services/invoices.ts](packages/server/src/services/invoices.ts) — `findInvoice`, `loadInvoiceForPayment` (populates customer, returns a flat DTO `InvoiceForPayment` so workflow code never touches ORM proxies), `markInvoicePaid`, `markInvoiceFailed`.
- [packages/server/src/services/payments.ts](packages/server/src/services/payments.ts) — `recordPaymentAttempt`, `updatePaymentAttempt`, `listPaymentAttempts` (ordered asc by `attemptNumber`).
- [packages/server/src/index.ts](packages/server/src/index.ts) — barrel export; also re-exports entity *types* from `@app/db` so consumers don't have to import `@app/db` directly.

### `packages/workflows` — Inngest + Anthropic

- [packages/workflows/src/client.ts](packages/workflows/src/client.ts) — `inngest` client (`id: 'react-app'`, typed by `InvoiceEvents`), lazy cached `getAnthropic()`, and `MODEL = { default: 'claude-sonnet-4-6', hardReasoning: 'claude-opus-4-7' }`.
- [packages/workflows/src/events.ts](packages/workflows/src/events.ts) — Zod schemas + `InvoiceEvents` union for `invoice/payment.requested`, `stripe/payment_intent.succeeded`, `invoice/customer.updated_payment`, `invoice/paid`, `invoice/payment.failed`, `invoice/fraud.review_needed`.
- [packages/workflows/src/invoices/pay-invoice.ts](packages/workflows/src/invoices/pay-invoice.ts) — the `pay-invoice` function. Triggered by `invoice/payment.requested`, concurrency-keyed on `invoiceId` (limit 1), idempotent by `idempotencyKey`, 2 retries. Steps:
  1. `load-invoice` via `loadInvoiceForPayment`.
  2. Precondition: `stripeCustomerId` required.
  3. `validate-payment-method` (stubbed `{ ok: true }`).
  4. Retry loop up to 3 attempts: `record-attempt-N` → `attempt-charge-N` (Stripe stub, currently always returns `failed/insufficient_funds`) → on success, `markInvoicePaid` + emit `invoice/paid` + return → otherwise `classifyPaymentFailure` agent → branch on category:
     - `fraud_suspected` → emit `invoice/fraud.review_needed`, throw `NonRetriableError`.
     - `permanent` → break.
     - `needs_customer_action` → `draftDunningEmail` agent → `send-dunning-email-N` (Resend stub, logs) → `step.waitForEvent('invoice/customer.updated_payment', timeout: '7d')` matched on `invoiceId`; continue on receipt, break on timeout.
     - `retryable` → `step.sleep('3d')` then retry (up to `MAX_RETRY_ATTEMPTS`).
  5. If loop exits without success → `markInvoiceFailed` + emit `invoice/payment.failed` with reason `'exhausted-retries'`.
- Agents:
  - [packages/workflows/src/invoices/agents/dispute-classifier.ts](packages/workflows/src/invoices/agents/dispute-classifier.ts) — `classifyPaymentFailure({ declineCode, stripeErrorMessage, previousAttempts })` → `{ category, reasoning, suggestedAction, model }`. Claude Sonnet, 512 tokens, ephemeral system-prompt cache. Output parsed with `classifierOutputSchema` (Zod).
  - [packages/workflows/src/invoices/agents/dunning-drafter.ts](packages/workflows/src/invoices/agents/dunning-drafter.ts) — `draftDunningEmail({ customerName, invoiceNumber, amountFormatted, failureCategory, attemptNumber, updatePaymentUrl })` → `{ subject, body, tone }`. Tone picked from attemptNumber (friendly/firm/final). Claude Sonnet, 1024 tokens, ephemeral cache.
- [packages/workflows/src/functions.ts](packages/workflows/src/functions.ts) — exports `functions = [payInvoice]` (what the Next.js `/api/inngest` handler registers).
- [packages/workflows/src/index.ts](packages/workflows/src/index.ts) — re-exports `inngest`, `getAnthropic`, `MODEL`, events, and `functions`.

### `packages/shared` — env + small utilities

- [packages/shared/src/env.ts](packages/shared/src/env.ts) — `@t3-oss/env-nextjs` schema. Server: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `INNGEST_EVENT_KEY/SIGNING_KEY/STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET`. Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`). `skipValidation` via `SKIP_ENV_VALIDATION=1`; empty strings treated as undefined.
- [packages/shared/src/money.ts](packages/shared/src/money.ts) — `currencySchema` (`usd|eur|gbp`), `moneySchema` (`{ amountCents, currency }`), `formatMoney()` using `Intl.NumberFormat`.

## Code References

- [biome.json:43-53](biome.json) — `noRestrictedImports` enforcing the DB boundary.
- [packages/server/src/context.ts:8-18](packages/server/src/context.ts) — `withServerContext` fork/flush/clear lifecycle.
- [packages/workflows/src/invoices/pay-invoice.ts](packages/workflows/src/invoices/pay-invoice.ts) — full state machine (load → validate → charge → classify → branch → retry/dunning/fraud → record).
- [packages/db/migrations/Migration20260421051047.ts](packages/db/migrations/Migration20260421051047.ts) — initial schema migration.
- [apps/web/lib/supabase/proxy.ts](apps/web/lib/supabase/proxy.ts) — Edge-Runtime-safe session refresh + route gating.

## Architecture Documentation

- **DB boundary**: everything DB-touching is in `@app/db` (schemas/migrations) or `@app/server` (services). Biome blocks anyone else from importing MikroORM or `@app/db`. Service functions all take `ServerContext` first; callers use `withServerContext` at the edge (typically inside `step.run` bodies in workflows).
- **Workflow model**: Inngest is the durable runtime. Outer flow is deterministic (step.run / step.sleep / step.waitForEvent), agent calls live inside `step.run` so their outputs are memoised. Agents are narrow single-decision LLM calls with Zod-validated structured outputs.
- **Env management**: `dotenv-cli --override` at the workspace root loads `.env.local` before Turbo dispatches `dev` and before DB scripts run. `@t3-oss/env-nextjs` validates vars at import. Edge-runtime middleware reads `NEXT_PUBLIC_*` directly from `process.env` to avoid importing the server-validated schema.
- **Migration workflow**: MikroORM TS migrations under `packages/db/migrations`. `pnpm db:reset` drops all public tables + enum types and re-runs `migration:up` (manual migration authoring is preferred because MikroORM's generator introspects Supabase internal schemas).

## Historical Context (from thoughts/)

No prior research docs in `thoughts/`. This is the first entry.

## Related Research

None yet.

## Open Questions

- No business UI exists yet (`/app` route group, auth pages, invoice views) — `proxy.ts` gates a `/app/*` space that is not implemented.
- Stripe integration in `pay-invoice` is stubbed (`attempt-charge-N` and `validate-payment-method`), as is dunning email delivery (`send-dunning-email-N`).
- No Supabase RLS policies committed; referenced as a first-deploy step in `DEPLOYING.md`.
- No Server Actions, tRPC routes, or trigger endpoints for sending `invoice/payment.requested` events from the UI.
