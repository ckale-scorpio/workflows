import { Migration } from '@mikro-orm/migrations';

export class Migration20260421_drop_workflow_runs extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "workflow_runs";`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table "workflow_runs" (
      "id" uuid not null default gen_random_uuid(),
      "inngest_run_id" varchar(255) not null,
      "workflow_name" varchar(255) not null,
      "subject_type" varchar(255) null,
      "subject_id" uuid null,
      "status" text check ("status" in ('running', 'succeeded', 'failed', 'paused')) not null default 'running',
      "started_at" timestamptz not null default now(),
      "completed_at" timestamptz null,
      "output" jsonb null,
      constraint "workflow_runs_pkey" primary key ("id")
    );`);
    this.addSql(`alter table "workflow_runs" add constraint "workflow_runs_inngest_run_id_unique" unique ("inngest_run_id");`);
    this.addSql(`create index "workflow_runs_workflow_name_index" on "workflow_runs" ("workflow_name");`);
  }
}
