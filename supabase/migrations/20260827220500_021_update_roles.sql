-- 021_update_roles.sql

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Migrate existing users to the new roles
UPDATE public.profiles SET role = 'sales_manager' WHERE role IN ('pic', 'manager', 'user');

-- Add new constraint
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'sales_manager', 'procurement'));

-- Set default role for new signups
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'sales_manager';

NOTIFY pgrst, 'reload schema';
