-- The Express backend uses a Supabase secret key, which assumes the
-- service_role Postgres role. RLS bypass alone does not grant table access.
-- Keep browser roles locked down while granting the backend its required CRUD.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload schema';
