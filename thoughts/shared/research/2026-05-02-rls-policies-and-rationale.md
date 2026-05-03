---
date: 2026-05-02T22:24:54-07:00
researcher: Chetan Kale
git_commit: 07e4e3ade33459cd93e6195910087e1a3eb930b5
branch: infra
repository: workflows
topic: "RLS policies for the app, and why a single-tenant Supabase app still needs RLS"
tags: [research, codebase, rls, supabase, security, auth, postgres]
status: complete
last_updated: 2026-05-02
last_updated_by: Chetan Kale
---

# Research: RLS Policies for the App + Why a Single-Tenant Supabase App Still Needs RLS

**Date**: 2026-05-02T22:24:54-07:00
**Researcher**: Chetan Kale
**Git Commit**: 07e4e3ade33459cd93e6195910087e1a3eb930b5
**Branch**: infra
**Repository**: workflows

## Research Question

1. What RLS policies should be applied to this codebase?
2. Since this app isn't multitenant, why do we need RLS at all?

---

## Summary

**Answering the second question first** because the first depends on its answer:

This app is **single-tenant** in the SaaS sense (no `organizations` table), but it is **multi-user** — every Profile, Document, Invoice, and PaymentAttempt belongs to a specific user, and other users must not see them. "Multitenancy" and "needs row-level authorization" are different concepts. RLS is required here because **Supabase exposes a PostgREST + Realtime + GoTrue API to every browser via the published `NEXT_PUBLIC_SUPABASE_ANON_KEY`**, and once a user logs in, their JWT identifies them as the `authenticated` Postgres role — which by default has full table privileges in the `public` schema. Without RLS, any logged-in user can issue `GET /rest/v1/documents` directly from their browser console and read every row in the database. The Next.js API route layer is irrelevant on that path; it's never invoked.

The app's MikroORM data path (Next.js API routes → `DATABASE_URL` → Postgres pooler) is unaffected by RLS, because that connection authenticates as the `postgres` superuser (BYPASSRLS). So enabling RLS is **a low-risk change**: it locks down the otherwise-open browser path without affecting the API layer.

For the first question — recommended policies for each of the 6 tables are listed in §4 below.

---

## 1. Why RLS Matters Here, Specifically

### What "the browser → Supabase" path actually looks like in this codebase

The Supabase URL and anon key are published in the Next.js client bundle:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are referenced in `apps/web/lib/supabase/client.ts:5` and `apps/web/lib/supabase/proxy.ts:7-8`.
- After login, the user's session JWT is stored in HTTP-only cookies and attached to every subsequent Supabase API call from the browser.
- That JWT identifies the bearer as the Postgres role `authenticated`.

Supabase exposes three APIs at `https://<project>.supabase.co`:

| Path | What it does | Auth |
|------|--------------|------|
| `/rest/v1/<table>` | Auto-generated PostgREST CRUD | anon key + JWT |
| `/realtime/v1/...` | Realtime channels (broadcast, presence, postgres-changes) | anon key + JWT |
| `/auth/v1/...` | GoTrue (sign-in, sign-up, sign-out) | anon key |

`schemas = ["public", "graphql_public"]` in `supabase/config.toml` confirms PostgREST exposes the entire `public` schema. Every table the MikroORM migrations create lands there.

### The actual scenario without RLS

A logged-in user opens browser devtools and runs:
```js
const res = await fetch(
  'https://<project>.supabase.co/rest/v1/documents?select=*',
  {
    headers: {
      apikey: '<NEXT_PUBLIC_SUPABASE_ANON_KEY>',
      Authorization: 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token,
    },
  },
);
```
With no RLS enabled, Postgres returns **every row in `documents`** — every other user's content, every shared session, everything. The Next.js route handlers in `apps/web/app/api/docs/` are never invoked.

Same goes for `invoices`, `payment_attempts`, `profiles`, `document_members`, `document_operations`. All open by default.

### What the browser actually queries today

A grep for `.from(` and `supabase.` in `apps/web/components/`, `apps/web/app/`, and `apps/web/lib/` shows:

| Surface | Used for | File |
|---------|----------|------|
| `supabase.auth.signInWithPassword` | Login form | `apps/web/app/login/page.tsx:17` |
| `supabase.auth.getUser` | Server-side session validation | All API routes + `apps/web/app/app/editor/page.tsx`, `[docId]/page.tsx` |
| `supabase.channel('doc:${docId}').on('broadcast', ...)` | Subscribe to realtime ops | `apps/web/components/editor/CollabEditor.tsx:44-52` |
| `supabase.removeChannel` | Cleanup | Same file, line 55 |

**Zero direct table queries from the browser.** So today, nothing in the app exercises the open PostgREST surface. The risk is *latent* — a malicious user (or a future feature added without thinking about it) would expose all data instantly.

### Why the API routes are unaffected by RLS

The Next.js API routes call `withServerContext` / `withTransactionalContext` (`packages/services/src/context.ts`), which uses MikroORM. MikroORM connects via `DATABASE_URL`, which `DEPLOYING.md` says must be the **Supabase Session-mode pooler** URL. That URL connects as the `postgres` role — a Postgres superuser with the `BYPASSRLS` attribute. Therefore:

- API route reads/writes: **bypass RLS** — work identically before/after enabling RLS.
- Browser → Supabase REST/Realtime: **subject to RLS** — locked down by the policies you write.
- Server → Supabase HTTP broadcast (`apps/web/app/api/docs/[docId]/ops/route.ts:81`): uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS.

Enabling RLS changes one thing only: **what the browser's JWT can see** when it talks to Supabase directly. That's exactly the surface that's currently unprotected.

### "But isn't multitenancy the reason for RLS?"

Multitenancy is one common motivator, but the underlying mechanism is "row-level authorization between users sharing a table." That's needed any time:
- Multiple users share the same physical tables, AND
- Some rows are visible/editable to some users but not others, AND
- Users have a path to query the database that you cannot mediate.

Supabase's anon-key + PostgREST is exactly that "path you cannot mediate" — once you publish the anon key in the browser bundle, you cannot remove it. RLS is the only way to restrict what `authenticated` JWTs can do.

If this were a self-hosted Postgres with no PostgREST and no anon key, and clients only ever connected through application servers, RLS would indeed be optional (defense-in-depth at most). With Supabase, the architecture imposes the requirement.

---

## 2. Data Model Recap (for policy design)

From `packages/db/src/entities/`:

```
auth.users (Supabase managed)
  │
  │  trigger: handle_new_user → INSERT into profiles with id = NEW.id
  ▼
profiles (id PK = auth.uid(), email, full_name, stripe_customer_id)
  │
  ├──< invoices.customer_id   (FK → profiles.id)
  │     │
  │     └──< payment_attempts.invoice_id   (FK → invoices.id)
  │
  └──< document_members.user_id   (FK → profiles.id)
        │
        └──> documents.id   (FK from document_members.document_id)
              │
              └──< document_operations.document_id   (FK → documents.id)
```

Key fact for policy design: **`profiles.id == auth.uid()`** because of the trigger in `Migration20260423_profile_trigger.ts`. So every policy can use `auth.uid()` directly without a join.

---

## 3. The Three Roles That Show Up in Policies

| Role | When it's the caller | RLS applies? |
|------|----------------------|--------------|
| `anon` | Logged-out browser w/ anon key | Yes |
| `authenticated` | Logged-in browser w/ user JWT | Yes |
| `service_role` | Server-side calls w/ service key | **Bypassed** |
| `postgres` (DATABASE_URL pooler) | MikroORM via Next.js API | **Bypassed** (BYPASSRLS) |

Almost every policy below targets `TO authenticated`. None target `service_role` or `postgres` because those bypass RLS regardless.

---

## 4. Recommended Policies, Per Table

The strategy: **all DML (writes) goes through API routes via MikroORM** (already the case). Browser-side RLS only needs to grant `SELECT` for what the browser legitimately reads. Today the browser reads nothing from tables directly — but enabling SELECT policies for member-owned data costs nothing and allows future client-side reads through PostgREST without re-auditing.

> Note: `(SELECT auth.uid())` is wrapped in a subquery (vs. bare `auth.uid()`) so the planner caches it once per query — Supabase's published RLS performance pattern.

### 4.1 `profiles`

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Read your own profile
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- Update your own profile (email/full_name; not stripe_customer_id which is server-managed)
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- INSERT: handled by handle_new_user() trigger as SECURITY DEFINER; no client policy
-- DELETE: not supported from the client
```

**Optional later:** if you ever display the email/name of the *other* member of a shared document, add a second SELECT policy:
```sql
CREATE POLICY profiles_select_co_member
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT user_id FROM public.document_members
      WHERE document_id IN (
        SELECT document_id FROM public.document_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );
```
The current API only returns `userId` in member lists, so this isn't needed yet.

### 4.2 `documents`

```sql
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select_member
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT document_id FROM public.document_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: API routes only (createDocument, etc.) which bypass RLS via MikroORM
```

### 4.3 `document_members`

```sql
ALTER TABLE public.document_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_members_select_own_or_co
  ON public.document_members FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR document_id IN (
      SELECT document_id FROM public.document_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: API routes only (joinDocument, etc.)
```

The OR allows a user to: (a) see their own memberships, and (b) see who their co-collaborators are on each shared document.

### 4.4 `document_operations`

```sql
ALTER TABLE public.document_operations ENABLE ROW LEVEL SECURITY;

-- Strict default: no client SELECT (ops stream to clients via Realtime broadcast,
-- not via direct PostgREST reads). If you later want a "history" feature, replace with the
-- alternative below.
-- (No policy = deny by default once RLS is enabled.)

-- Alternative: allow members of a doc to read its ops via PostgREST
-- CREATE POLICY document_operations_select_member
--   ON public.document_operations FOR SELECT
--   TO authenticated
--   USING (
--     document_id IN (
--       SELECT document_id FROM public.document_members
--       WHERE user_id = (SELECT auth.uid())
--     )
--   );
```

### 4.5 `invoices`

```sql
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select_own
  ON public.invoices FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

-- INSERT/UPDATE/DELETE: server-only (workflow + API)
```

### 4.6 `payment_attempts`

```sql
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- Default: no client policy at all → deny by default once RLS is on.
-- Payment attempt rows contain agent reasoning text and Stripe error JSON;
-- nothing in the current UI displays them.

-- Alternative if a "billing history" page eventually shows these:
-- CREATE POLICY payment_attempts_select_via_own_invoice
--   ON public.payment_attempts FOR SELECT
--   TO authenticated
--   USING (
--     invoice_id IN (
--       SELECT id FROM public.invoices
--       WHERE customer_id = (SELECT auth.uid())
--     )
--   );
```

---

## 5. Realtime Broadcast — A Separate Access Surface

Table-level RLS does **not** cover Realtime channels. The app uses:
- Server: `POST ${SUPABASE_URL}/realtime/v1/api/broadcast` with topic `realtime:doc:${docId}` (`apps/web/app/api/docs/[docId]/ops/route.ts:81-97`). Authorized by `SUPABASE_SERVICE_ROLE_KEY` — always works.
- Client: `supabase.channel('doc:${docId}').on('broadcast', { event: 'op' }, ...)` (`apps/web/components/editor/CollabEditor.tsx:44`).

In current Supabase versions, broadcast subscription is gated by RLS policies on the `realtime.messages` table when the channel is configured as private. By default channels are public — anyone with the anon key + a JWT and the `docId` UUID can subscribe.

If you want broadcast restricted to document members (defense-in-depth — doc UUIDs leak through URLs):

```sql
-- Requires private channels — must also enable on the client:
--   supabase.channel(`doc:${docId}`, { config: { private: true } })

CREATE POLICY broadcast_doc_members
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    -- topic format from server: "realtime:doc:<uuid>" → after stripping prefix: "doc:<uuid>"
    EXISTS (
      SELECT 1 FROM public.document_members
      WHERE user_id = (SELECT auth.uid())
        AND document_id::text = split_part(realtime.topic(), ':', 2)
    )
  );
```

The exact API for `realtime.topic()` and policy attachment changes between Supabase versions. Verify against your project's Supabase version before applying.

---

## 6. How to Apply These Policies

`DEPLOYING.md` says: *"Apply RLS policies via Supabase SQL editor or a migration."* Three viable delivery paths:

| Path | How | Pros | Cons |
|------|-----|------|------|
| MikroORM migration | Add a new file under `packages/db/migrations/` using `this.execute(...)` with the SQL | Tracked in same pipeline as schema | Mixes app-level and Supabase-level concerns |
| Supabase migration | `supabase migration new add_rls` then `supabase db push` | Lives in `supabase/migrations/` (separate from MikroORM) — matches DEPLOYING.md mental model | Requires Supabase CLI in CI |
| Manual via SQL editor | Paste into Supabase dashboard's SQL editor | Fastest for first deploy | Not reproducible — easy to drift |

The repo doesn't currently have a `supabase/migrations/` directory (only `supabase/config.toml` and an empty `snippets/` folder), so adding one would be a new convention.

---

## 7. Verifying Policies After Applying

After enabling RLS + applying policies, two practical verifications:

1. **MikroORM API path still works.** Run any existing API route (e.g. `POST /api/docs`) — it should succeed because the `postgres` connection bypasses RLS.
2. **Browser direct query is now blocked.** From devtools after logging in:
   ```js
   const r = await fetch(
     `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/invoices?select=*`,
     { headers: { apikey: '<anon>', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session.access_token}` } }
   );
   ```
   Should return `[]` (only your own invoices) for `invoices` table, and `[]` or `403` for `payment_attempts` (no SELECT policy granted).

3. **Realtime still works.** The `CollabEditor` realtime subscription should keep receiving ops on docs you're a member of.

---

## Code References

- `apps/web/lib/supabase/client.ts:5` — browser client uses anon key
- `apps/web/lib/supabase/proxy.ts:7-8` — edge middleware reads anon key from `process.env`
- `apps/web/components/editor/CollabEditor.tsx:42-57` — only browser-side Supabase use beyond auth
- `apps/web/app/login/page.tsx:17` — sole place `signInWithPassword` is called
- `apps/web/app/api/docs/[docId]/ops/route.ts:81-97` — server-side realtime broadcast (service role)
- `packages/db/migrations/Migration20260423_profile_trigger.ts` — establishes that `profiles.id == auth.users.id`
- `packages/db/src/entities/Profile.ts`, `Invoice.ts`, `PaymentAttempt.ts`, `Document.ts`, `DocumentMember.ts`, `DocumentOperation.ts` — full schema for policy design
- `packages/services/src/context.ts` — `withServerContext`/`withTransactionalContext` (MikroORM path that bypasses RLS)
- `supabase/config.toml` — `schemas = ["public", "graphql_public"]` confirms PostgREST exposes the public schema
- `DEPLOYING.md:32` — *"Apply RLS policies via Supabase SQL editor or a migration."*

## Architecture Documentation

```
Browser (NEXT_PUBLIC_* env vars in JS bundle)
   │
   ├─ supabase.auth.*     ──► Supabase GoTrue                ► protected by GoTrue
   ├─ supabase.channel(...) ► Supabase Realtime               ► protected by realtime.messages RLS (if private)
   └─ (capability) ────────► Supabase PostgREST /rest/v1/*   ► protected ONLY by table RLS
                                                                (currently UNPROTECTED — no policies)

Browser ──► Next.js API routes ──► @app/services ──► MikroORM ──► Postgres (postgres role, BYPASSRLS)
                                                                   ► RLS does not apply

Inngest job (@app/jobs)
   └─► withServerContext ──► MikroORM ──► same path as above ──► BYPASSRLS

Server-side Supabase HTTP broadcast (uses SUPABASE_SERVICE_ROLE_KEY)
   └─► bypasses RLS regardless of policies
```

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-05-02-vercel-deployment-readiness.md` — documented the absence of any RLS-related code or migrations and noted DEPLOYING.md's instruction to apply RLS manually
- `thoughts/shared/research/2026-04-29-package-structure-audit.md` — package layout context (now superseded by the `services/jobs/core` rename)

## Related Research

- `thoughts/shared/research/2026-05-02-vercel-deployment-readiness.md` (deployment readiness pass)

## Open Questions

- Should `payment_attempts` and `document_operations` have client-readable policies, or remain RLS-deny (server-only access)? Depends on whether the UI ever shows them directly via PostgREST.
- Should broadcast channels be made `private` and gated through `realtime.messages` RLS? Currently the doc UUID is the only access barrier; UUIDs are unguessable but appear in URLs.
- Should profile rows of co-members be visible (for "shared with X" UI)? Currently the API doesn't expose that, but if the UI grows to show member identities, the policy in §4.1 (the optional `profiles_select_co_member`) will be needed.
- Delivery mechanism: MikroORM migration vs. `supabase/migrations/` vs. SQL-editor manual application — pick one and codify it in `DEPLOYING.md`.
