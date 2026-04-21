import { Migration } from '@mikro-orm/migrations';

export class Migration20260421051047 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create type "invoice_status" as enum ('draft', 'pending', 'paid', 'failed', 'cancelled', 'refunded');`);
    this.addSql(`create type "payment_attempt_status" as enum ('pending', 'requires_action', 'succeeded', 'failed');`);
    this.addSql(`create type "failure_category" as enum ('retryable', 'needs_customer_action', 'fraud_suspected', 'permanent', 'unknown');`);
    this.addSql(`create table "profiles" ("id" uuid not null, "email" varchar(255) not null, "full_name" varchar(255) null, "stripe_customer_id" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "profiles_pkey" primary key ("id"));`);
    this.addSql(`alter table "profiles" add constraint "profiles_stripe_customer_id_unique" unique ("stripe_customer_id");`);

    this.addSql(`create table "invoices" ("id" uuid not null default gen_random_uuid(), "customer_id" uuid not null, "amount_cents" bigint not null, "currency" varchar(255) not null default 'usd', "status" "invoice_status" not null default 'draft', "due_at" timestamptz null, "stripe_invoice_id" varchar(255) null, "metadata" jsonb not null default '{}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "invoices_customer_id_index" on "invoices" ("customer_id");`);
    this.addSql(`create index "invoices_status_index" on "invoices" ("status");`);
    this.addSql(`alter table "invoices" add constraint "invoices_stripe_invoice_id_unique" unique ("stripe_invoice_id");`);

    this.addSql(`create table "payment_attempts" ("id" uuid not null default gen_random_uuid(), "invoice_id" uuid not null, "attempt_number" int not null, "status" "payment_attempt_status" not null default 'pending', "stripe_payment_intent_id" varchar(255) null, "decline_code" varchar(255) null, "failure_category" "failure_category" null, "agent_reasoning" text null, "agent_model" varchar(255) null, "error" jsonb null, "started_at" timestamptz not null default now(), "completed_at" timestamptz null, constraint "payment_attempts_pkey" primary key ("id"));`);
    this.addSql(`create index "payment_attempts_invoice_id_index" on "payment_attempts" ("invoice_id");`);

    this.addSql(`create table "workflow_runs" ("id" uuid not null default gen_random_uuid(), "inngest_run_id" varchar(255) not null, "workflow_name" varchar(255) not null, "subject_type" varchar(255) null, "subject_id" uuid null, "status" text check ("status" in ('running', 'succeeded', 'failed', 'paused')) not null default 'running', "started_at" timestamptz not null default now(), "completed_at" timestamptz null, "output" jsonb null, constraint "workflow_runs_pkey" primary key ("id"));`);
    this.addSql(`alter table "workflow_runs" add constraint "workflow_runs_inngest_run_id_unique" unique ("inngest_run_id");`);
    this.addSql(`create index "workflow_runs_workflow_name_index" on "workflow_runs" ("workflow_name");`);

    this.addSql(`alter table "invoices" add constraint "invoices_customer_id_foreign" foreign key ("customer_id") references "profiles" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "payment_attempts" add constraint "payment_attempts_invoice_id_foreign" foreign key ("invoice_id") references "invoices" ("id") on update cascade on delete cascade;`);
  }

}
