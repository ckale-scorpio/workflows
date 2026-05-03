import { Migration } from '@mikro-orm/migrations';

// ---------------------------------------------------------------------------
// Why RLS on a single-tenant app?
//
// Supabase auto-exposes every table in the public schema through its PostgREST
// REST API.  The anon key ships in the browser bundle, so any visitor can send
// authenticated requests.  Without RLS, a logged-in user can query ANY row via
// the REST API even though the server-side (MikroORM / DATABASE_URL) code never
// does so — the MikroORM path connects as the postgres superuser which bypasses
// RLS entirely.
//
// Enabling RLS on each table makes "deny by default" the rule for the
// `authenticated` and `anon` Postgres roles that PostgREST uses.  Explicit
// policies are then added only where browser access is actually needed.
//
// Performance note: all policies use the `(SELECT auth.uid())` subquery form
// so the planner can treat the result as a constant and evaluate it once per
// query rather than once per row.
// ---------------------------------------------------------------------------

export class Migration20260502_add_rls_policies extends Migration {
  override async up(): Promise<void> {
    // ── profiles ────────────────────────────────────────────────────────────
    // profiles.id is set to auth.uid() by the handle_new_user() trigger, so
    // comparing id against auth.uid() is the natural ownership check.

    this.addSql(`alter table public.profiles enable row level security;`);

    this.addSql(`
      create policy "profiles_select_own"
        on public.profiles
        for select
        to authenticated
        using ((select auth.uid()) = id);
    `);

    this.addSql(`
      create policy "profiles_update_own"
        on public.profiles
        for update
        to authenticated
        using ((select auth.uid()) = id)
        with check ((select auth.uid()) = id);
    `);

    // ── documents ───────────────────────────────────────────────────────────
    // Documents have no direct user column; membership is tracked in
    // document_members.  A user may read a document iff they appear in that
    // join table for that document.

    this.addSql(`alter table public.documents enable row level security;`);

    this.addSql(`
      create policy "documents_select_member"
        on public.documents
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.document_members
            where document_members.document_id = documents.id
              and document_members.user_id = (select auth.uid())
          )
        );
    `);

    // ── document_members ────────────────────────────────────────────────────
    // Users may read their own membership rows.  This is also the table that
    // the documents policy above queries, so keeping this policy simple
    // (user_id = self) avoids a recursive policy reference.

    this.addSql(`alter table public.document_members enable row level security;`);

    this.addSql(`
      create policy "document_members_select_own"
        on public.document_members
        for select
        to authenticated
        using (user_id = (select auth.uid()));
    `);

    // ── document_operations ─────────────────────────────────────────────────
    // No SELECT policy → deny all browser access.
    // Document operations are never queried via PostgREST; they flow from the
    // server into clients exclusively through Supabase Realtime broadcast.

    this.addSql(`alter table public.document_operations enable row level security;`);

    // ── invoices ────────────────────────────────────────────────────────────
    // A customer may read their own invoices.  invoices.customer_id is a FK to
    // profiles.id which equals auth.uid() for the logged-in user.

    this.addSql(`alter table public.invoices enable row level security;`);

    this.addSql(`
      create policy "invoices_select_own"
        on public.invoices
        for select
        to authenticated
        using (customer_id = (select auth.uid()));
    `);

    // ── payment_attempts ────────────────────────────────────────────────────
    // No SELECT policy → deny all browser access.
    // Payment attempt details (decline codes, agent reasoning, Stripe IDs) are
    // internal billing data and are never queried directly from the browser.

    this.addSql(`alter table public.payment_attempts enable row level security;`);
  }

  override async down(): Promise<void> {
    // Drop policies before disabling RLS so the rollback is clean even if it
    // is run in a partial state.

    this.addSql(`drop policy if exists "profiles_select_own" on public.profiles;`);
    this.addSql(`drop policy if exists "profiles_update_own" on public.profiles;`);
    this.addSql(`alter table public.profiles disable row level security;`);

    this.addSql(`drop policy if exists "documents_select_member" on public.documents;`);
    this.addSql(`alter table public.documents disable row level security;`);

    this.addSql(`drop policy if exists "document_members_select_own" on public.document_members;`);
    this.addSql(`alter table public.document_members disable row level security;`);

    this.addSql(`alter table public.document_operations disable row level security;`);

    this.addSql(`drop policy if exists "invoices_select_own" on public.invoices;`);
    this.addSql(`alter table public.invoices disable row level security;`);

    this.addSql(`alter table public.payment_attempts disable row level security;`);
  }
}
