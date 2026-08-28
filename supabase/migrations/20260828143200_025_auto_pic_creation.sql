-- 025_auto_pic_creation.sql

-- We update the handle_new_user function to automatically create a PIC ledger record 
-- for the user when they register.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
  _full_name TEXT;
  _profile_id UUID;
BEGIN
  -- Safely extract data from raw_user_meta_data
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    _username := NEW.raw_user_meta_data->>'username';
    _full_name := NEW.raw_user_meta_data->>'full_name';
  END IF;

  -- Fallback if username is null
  IF _username IS NULL OR _username = '' THEN
    _username := split_part(NEW.email, '@', 1);
  END IF;

  -- Fallback to avoid unique constraint violations on username by appending random string if needed
  BEGIN
      INSERT INTO public.profiles (id, email, username, full_name)
      VALUES (
        NEW.id,
        NEW.email,
        _username,
        _full_name
      )
      RETURNING id INTO _profile_id;
  EXCEPTION WHEN unique_violation THEN
      INSERT INTO public.profiles (id, email, username, full_name)
      VALUES (
        NEW.id,
        NEW.email,
        _username || '_' || substr(md5(random()::text), 1, 4),
        _full_name
      )
      RETURNING id INTO _profile_id;
  END;

  -- Automatically create a PIC identity for the user so they can own pipeline data immediately
  IF _profile_id IS NOT NULL THEN
      INSERT INTO public.pics (profile_id, name, status)
      VALUES (
          _profile_id, 
          COALESCE(_full_name, _username, split_part(NEW.email, '@', 1)), 
          'active'
      )
      ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile/PIC for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create PICs for existing profiles that don't have one
INSERT INTO public.pics (profile_id, name, status)
SELECT 
    id, 
    COALESCE(full_name, username, split_part(email, '@', 1)), 
    'active'
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.pics WHERE profile_id = p.id);

NOTIFY pgrst, 'reload schema';

-- Rescue orphaned pipeline data (where pic_id is null) by assigning them to the first Admin's PIC.
-- Since the user complained about 74 orphaned prospects, this cleans up the DB automatically.
DO $$
DECLARE
    v_admin_pic_id UUID;
BEGIN
    -- Find the PIC ID of the first admin
    SELECT p.id INTO v_admin_pic_id
    FROM public.pics p
    JOIN public.profiles pr ON pr.id = p.profile_id
    WHERE pr.role = 'admin' AND p.status = 'active'
    LIMIT 1;

    IF v_admin_pic_id IS NOT NULL THEN
        UPDATE public.prospect_clients SET pic_id = v_admin_pic_id WHERE pic_id IS NULL;
        UPDATE public.warm_leads SET pic_id = v_admin_pic_id WHERE pic_id IS NULL;
        UPDATE public.inquiries SET pic_id = v_admin_pic_id WHERE pic_id IS NULL;
        UPDATE public.quotations SET pic_id = v_admin_pic_id WHERE pic_id IS NULL;
        UPDATE public.sales SET pic_id = v_admin_pic_id WHERE pic_id IS NULL;
    END IF;
END $$;
