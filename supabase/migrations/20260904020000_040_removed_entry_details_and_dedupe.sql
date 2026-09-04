-- 040_removed_entry_details_and_dedupe.sql
--
-- Two related data-quality fixes.
--
-- 1. Bulk removal only stored the identity (email/phone). It looked the contact up
--    to RETURN a display name, but never wrote company_id/contact_id to the row, so
--    the Removed Sheet showed blank Company/Contact for anything pasted in, while a
--    row-level "Remove" captured the full record. Pasting an email or phone should
--    pull the whole client through, exactly like the clickable option does.
--
--    Storing the ids also strengthens suppression: the pipeline filters exclude by
--    company_id/contact_id as well as by normalized identity, so a bulk-removed
--    contact now suppresses their company's other identities too.
--
-- 2. Duplicate prospects still get through. A dedupe helper collapses them, keeping
--    the earliest row per company and deleting the rest.

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Bulk removal captures the full client record
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_add_removed_entries(
    p_identifiers TEXT[], p_reason TEXT, p_actor_id UUID
)
RETURNS TABLE (
    raw_value TEXT, identity_type TEXT, normalized_value TEXT,
    company_name TEXT, contact_name TEXT, was_new BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_raw TEXT; v_type TEXT; v_norm TEXT;
    v_company_id UUID; v_contact_id UUID;
    v_company_name TEXT; v_contact_name TEXT;
    v_inserted BOOLEAN;
BEGIN
    FOREACH v_raw IN ARRAY p_identifiers LOOP
        v_raw := btrim(v_raw);
        CONTINUE WHEN v_raw = '';

        IF v_raw LIKE '%@%' THEN
            v_type := 'email';
            v_norm := public.normalize_email(v_raw);
        ELSE
            v_type := 'phone';
            v_norm := public.normalize_phone(v_raw);
        END IF;
        CONTINUE WHEN v_norm IS NULL;

        -- Resolve the identity to a real contact/company so the row carries the whole
        -- client, not just the string that was pasted.
        SELECT co.id, c.id, c.name, (co.first_name || ' ' || COALESCE(co.last_name, ''))
        INTO v_contact_id, v_company_id, v_company_name, v_contact_name
        FROM public.contacts co
        LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id AND cc.is_primary = true
        LEFT JOIN public.companies c ON c.id = cc.company_id
        WHERE (v_type = 'email' AND v_norm IN (co.email_active_normalized, co.email_2_normalized))
           OR (v_type = 'phone' AND v_norm IN (co.phone_direct_normalized, co.phone_2_normalized))
        LIMIT 1;

        INSERT INTO public.removed_entries (
            identity_type, normalized_value, company_id, contact_id, reason, source, created_by
        )
        VALUES (
            v_type, v_norm, v_company_id, v_contact_id,
            COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste'), 'deliverability', p_actor_id
        )
        ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
        -- Re-pasting a known identity now backfills the linkage on the existing row
        -- rather than silently doing nothing.
        DO UPDATE SET
            company_id = COALESCE(public.removed_entries.company_id, EXCLUDED.company_id),
            contact_id = COALESCE(public.removed_entries.contact_id, EXCLUDED.contact_id);
        v_inserted := FOUND;

        raw_value := v_raw;
        identity_type := v_type;
        normalized_value := v_norm;
        company_name := v_company_name;
        contact_name := NULLIF(btrim(v_contact_name), '');
        was_new := v_inserted;
        RETURN NEXT;

        v_company_id := NULL; v_contact_id := NULL;
        v_company_name := NULL; v_contact_name := NULL;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) TO service_role;

-- Backfill rows already stored without linkage, matching on the same rule.
UPDATE public.removed_entries r
SET company_id = COALESCE(r.company_id, m.company_id),
    contact_id = COALESCE(r.contact_id, m.contact_id)
FROM (
    SELECT re.id AS entry_id, co.id AS contact_id, c.id AS company_id
    FROM public.removed_entries re
    JOIN public.contacts co
      ON (re.identity_type = 'email' AND re.normalized_value IN (co.email_active_normalized, co.email_2_normalized))
      OR (re.identity_type = 'phone' AND re.normalized_value IN (co.phone_direct_normalized, co.phone_2_normalized))
    LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id AND cc.is_primary = true
    LEFT JOIN public.companies c ON c.id = cc.company_id
    WHERE re.company_id IS NULL OR re.contact_id IS NULL
) m
WHERE r.id = m.entry_id;

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. Collapse duplicate prospects
-- ───────────────────────────────────────────────────────────────────────────────
-- Import dedupes on normalized identity, but rows still slip through when the same
-- company arrives with a different contact identity (or none at all). This keeps the
-- earliest prospect per company and removes the rest. Returns how many it deleted so
-- the caller can report it.
CREATE OR REPLACE FUNCTION public.dedupe_prospect_clients(p_pic_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY company_id, pic_id
                 ORDER BY created_at, id
               ) AS rn
        FROM public.prospect_clients
        WHERE lifecycle_status = 'active'
          AND company_id IS NOT NULL
          AND (p_pic_id IS NULL OR pic_id = p_pic_id)
    ),
    removed AS (
        DELETE FROM public.prospect_clients
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        RETURNING 1
    )
    SELECT count(*)::int INTO v_deleted FROM removed;

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_prospect_clients(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedupe_prospect_clients(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
