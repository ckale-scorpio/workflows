import { Migration } from '@mikro-orm/migrations';

export class Migration20260423_profile_trigger extends Migration {
  override async up(): Promise<void> {
    // Function called by the trigger — copies auth user into public.profiles on signup.
    // NEW.raw_user_meta_data contains any metadata passed at sign-up time (e.g. full_name).
    this.addSql(`
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer set search_path = ''
      as $$
      begin
        insert into public.profiles (id, email, full_name)
        values (
          new.id,
          new.email,
          new.raw_user_meta_data ->> 'full_name'
        )
        on conflict (id) do nothing;
        return new;
      end;
      $$;
    `);

    this.addSql(`
      create or replace trigger on_auth_user_created
        after insert on auth.users
        for each row execute procedure public.handle_new_user();
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists on_auth_user_created on auth.users;`);
    this.addSql(`drop function if exists public.handle_new_user();`);
  }
}
