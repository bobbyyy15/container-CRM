import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// We use the service key in the backend to bypass RLS when necessary (like writing audit logs)
// or we can instantiate a user-scoped client if we pass the JWT.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
