import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || '';

// We use the service key in the backend to bypass RLS when necessary (like writing audit logs)
// or we can instantiate a user-scoped client if we pass the JWT.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
