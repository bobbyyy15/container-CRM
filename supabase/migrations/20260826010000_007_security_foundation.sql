-- Security foundation: private OAuth storage, replay-safe OAuth state, and API-only business tables.

CREATE TABLE public.google_oauth_credentials (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    google_email TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.google_oauth_states (
    state_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX google_oauth_states_expiry_idx
    ON public.google_oauth_states (expires_at)
    WHERE consumed_at IS NULL;

-- Preserve any credentials written by migration 006 before removing them from the public profile row.
INSERT INTO public.google_oauth_credentials (user_id, google_email, refresh_token)
SELECT id, google_email, google_refresh_token
FROM public.profiles
WHERE google_email IS NOT NULL AND google_refresh_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
    google_email = EXCLUDED.google_email,
    refresh_token = EXCLUDED.refresh_token,
    updated_at = NOW();

ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS google_refresh_token,
    DROP COLUMN IF EXISTS google_email;

ALTER TABLE public.google_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;

-- These tables are backend service-role only. No browser policies are intentionally created.
REVOKE ALL ON public.google_oauth_credentials FROM anon, authenticated;
REVOKE ALL ON public.google_oauth_states FROM anon, authenticated;

-- Profiles are no longer publicly enumerable. Authenticated users can only read their own profile.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, email, username, full_name, role, status, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- Normalize the legacy default role to the operational role described by the project specification.
UPDATE public.profiles SET role = 'pic' WHERE role = 'user';
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'pic';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager', 'pic'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive'));
    END IF;
END $$;

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

-- Operational data is accessed through the authenticated Express API, not directly from the browser.
ALTER TABLE public.pics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_staging_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quotation view" ON public.quotations;
DROP POLICY IF EXISTS "Quotation insert" ON public.quotations;
DROP POLICY IF EXISTS "Quotation update" ON public.quotations;
DROP POLICY IF EXISTS "Sale view" ON public.sales;
DROP POLICY IF EXISTS "Sale insert" ON public.sales;
DROP POLICY IF EXISTS "Sale update" ON public.sales;
DROP POLICY IF EXISTS "Contract view" ON public.contracts;
DROP POLICY IF EXISTS "Contract insert" ON public.contracts;
DROP POLICY IF EXISTS "Contract update" ON public.contracts;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT (id, email, username, full_name, role, status, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
