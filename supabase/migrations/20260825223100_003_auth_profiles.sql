-- Drop existing policies if they exist to avoid the 42710 error
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read profiles (useful for looking up usernames)
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

-- Only the user can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
  _full_name TEXT;
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
  -- (In a real app, we'd handle this better, but this ensures the trigger never fails)
  
  INSERT INTO public.profiles (id, email, username, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    _username,
    _full_name
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If username is taken, append random characters to force it through safely
    INSERT INTO public.profiles (id, email, username, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      _username || '_' || substr(md5(random()::text), 1, 4),
      _full_name
    );
    RETURN NEW;
  WHEN OTHERS THEN
    -- If any other error occurs, log it and still return NEW so auth creation doesn't fail completely
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
