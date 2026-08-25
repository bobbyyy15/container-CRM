-- Add OAuth fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_email TEXT;
NOTIFY pgrst, 'reload schema';
