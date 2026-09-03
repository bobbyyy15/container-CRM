-- 039_realtime_publication.sql
--
-- Moves live CRM updates from a self-hosted Socket.IO server to Supabase Realtime.
--
-- The old design (backend/src/realtime.ts) attached Socket.IO to the Express HTTP
-- server and broadcast an invalidation signal on every successful mutation. That
-- requires a long-running process, which rules out deploying the API to Vercel's
-- request-scoped serverless functions. Supabase already hosts Realtime, so the
-- websocket moves there and the API becomes fully stateless.
--
-- Semantics are preserved: clients still receive only a "something changed" signal
-- and refetch through the authenticated HTTP endpoints, so every existing role and
-- PIC filter continues to apply. Realtime additionally honours RLS, so a user is
-- only notified about rows they could already read -- strictly narrower than the
-- previous broadcast-to-all-authenticated behaviour.
--
-- Only the tables that back a live list are published. Adding a table here is what
-- makes it emit; the client subscribes to the whole `public` schema and maps table
-- names to the resource keys used by useRealtimeRevision().

DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        -- resource: 'leads'
        'prospect_clients',
        'warm_leads',
        'inquiries',
        'companies',
        'contacts',
        'removed_entries',
        -- resource: 'deals'
        'quotations',
        'sales',
        -- resource: 'contracts'
        'contracts',
        -- resource: 'inventory'
        'inventory',
        -- resource: 'notifications'
        'notifications'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        -- Skip tables that don't exist in this database rather than failing the
        -- whole migration, and skip ones already published (re-running is a no-op).
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table
        ) THEN
            RAISE NOTICE 'Skipping %: table does not exist', v_table;
            CONTINUE;
        END IF;

        IF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = v_table
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END LOOP;
END $$;
