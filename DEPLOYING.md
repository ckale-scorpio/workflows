# Deploying

## Production services to create

1. **Supabase project** — create at <https://supabase.com>. From Settings → API, copy `URL`, `anon` key, `service_role` key. From Settings → Database, copy the **Session mode** pooler connection string (NOT transaction mode — MikroORM needs session for prepared statements + Unit of Work).
2. **Vercel project** — import this Git repo. Root directory: `apps/web`. Framework preset: Next.js. Build command: `cd ../.. && pnpm --filter @app/web build`. Install command: `cd ../.. && pnpm install --frozen-lockfile`.
3. **Inngest Cloud app** — create at <https://app.inngest.com>. From Manage → Event Keys, copy the Event Key and Signing Key.
4. **Anthropic API key** — create at <https://console.anthropic.com>.

## Environment variables (set in Vercel)

Server-side (not prefixed with `NEXT_PUBLIC_`):
- `ANTHROPIC_API_KEY`
- `DATABASE_URL` (Supabase session-mode pooler URI)
- `SUPABASE_SERVICE_ROLE_KEY`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `STRIPE_SECRET_KEY` (if using Stripe)
- `STRIPE_WEBHOOK_SECRET`

Client-side:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (your prod URL, e.g. `https://app.example.com`)

## First deploy

1. Push to `main`. CI runs typecheck/lint/test/build.
2. Vercel builds and deploys. Note the production URL.
3. In Inngest Cloud, register the sync endpoint: `https://<prod-url>/api/inngest`. Inngest will introspect and list `pay-invoice`.
4. Run migrations against prod DB: `DATABASE_URL=... pnpm --filter @app/db db:migrate` (runs `mikro-orm migration:up`). To generate a new migration after entity changes, run `pnpm --filter @app/db db:generate` locally and commit the generated file under `packages/db/migrations`.
5. Apply RLS policies via Supabase SQL editor or a migration.
6. Smoke test: sign up a user, trigger a test event from Inngest dashboard's "Send event" UI, watch the run execute.

## Local development

```
cp .env.example .env.local          # fill in values
pnpm install
supabase start                       # requires Docker Desktop running
pnpm --filter @app/db db:migrate    # apply schema to local DB (MikroORM)
pnpm dev                             # Next.js on :3000
pnpm dlx inngest-cli@latest dev     # Inngest dev server on :8288 (separate terminal)
```

## Architectural boundary: database access

All DB access goes through `@app/server` — a service-layer package that wraps `@app/db` (MikroORM). **Nothing else may import `@app/db`, `@mikro-orm/core`, or `@mikro-orm/postgresql`.** This is enforced by Biome's `noRestrictedImports` rule (see `biome.json`), with an override that exempts `packages/server/**` and `packages/db/**`.

When you need a new DB operation:
1. Add or modify an EntitySchema in `packages/db/src/entities`.
2. Generate a migration: `pnpm --filter @app/db db:generate`.
3. Expose a service function in `packages/server/src/services/<domain>.ts` taking `ServerContext` as the first argument.
4. Call it from workflows or Server Actions wrapped in `withServerContext(async (ctx) => { ... })`.
