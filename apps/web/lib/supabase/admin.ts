import { env } from '@app/core/env';
import { createClient } from '@supabase/supabase-js';

let cached: ReturnType<typeof createClient> | undefined;

export function createSupabaseAdminClient() {
  if (!cached) {
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
