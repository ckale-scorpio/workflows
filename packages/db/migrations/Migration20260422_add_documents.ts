import { Migration } from '@mikro-orm/migrations';

export class Migration20260422_add_documents extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "documents" (
        "id" uuid not null default gen_random_uuid(),
        "title" varchar(255) not null default 'Untitled',
        "current_revision" int not null default 0,
        "content" jsonb not null default '[{"type":"paragraph","children":[{"text":""}]}]',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "documents_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "document_members" (
        "id" uuid not null default gen_random_uuid(),
        "document_id" uuid not null,
        "user_id" uuid not null,
        "joined_at" timestamptz not null default now(),
        constraint "document_members_pkey" primary key ("id"),
        constraint "document_members_document_id_user_id_unique" unique ("document_id", "user_id")
      );
    `);
    this.addSql(`create index "document_members_document_id_index" on "document_members" ("document_id");`);
    this.addSql(`create index "document_members_user_id_index" on "document_members" ("user_id");`);

    this.addSql(`
      create table "document_operations" (
        "id" uuid not null default gen_random_uuid(),
        "document_id" uuid not null,
        "server_rev" int not null,
        "client_id" varchar(255) not null,
        "client_rev" int not null,
        "op" jsonb not null,
        "applied_at" timestamptz not null default now(),
        constraint "document_operations_pkey" primary key ("id"),
        constraint "document_operations_document_id_server_rev_unique" unique ("document_id", "server_rev")
      );
    `);
    this.addSql(`create index "document_operations_document_id_index" on "document_operations" ("document_id");`);

    this.addSql(`alter table "document_members" add constraint "document_members_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "document_members" add constraint "document_members_user_id_foreign" foreign key ("user_id") references "profiles" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "document_operations" add constraint "document_operations_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "document_operations";`);
    this.addSql(`drop table if exists "document_members";`);
    this.addSql(`drop table if exists "documents";`);
  }
}
