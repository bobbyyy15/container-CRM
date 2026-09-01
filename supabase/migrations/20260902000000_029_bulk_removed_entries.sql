-- 029_bulk_removed_entries.sql
--
-- Backs the Deliverability page's "Paste Bounced Emails/Failed Numbers" workflow: given a
-- raw block of pasted identifiers (one per line), normalize each, match it against existing
-- contacts for display, and add it to the shared removed_entries suppression list (the same
-- list every pipeline list view already filters against).

CREATE OR REPLACE FUNCTION public.bulk_add_removed_entries(
    p_identifiers TEXT[],
    p_reason TEXT,
    p_actor_id UUID
)
RETURNS TABLE (
    raw_value TEXT,
    identity_type TEXT,
    normalized_value TEXT,
    company_name TEXT,
    contact_name TEXT,
    was_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_raw TEXT;
    v_type TEXT;
    v_norm TEXT;
    v_company_name TEXT;
    v_contact_name TEXT;
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

        SELECT c.name, (co.first_name || ' ' || COALESCE(co.last_name, ''))
        INTO v_company_name, v_contact_name
        FROM public.contacts co
        LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id AND cc.is_primary = true
        LEFT JOIN public.companies c ON c.id = cc.company_id
        WHERE (v_type = 'email' AND v_norm IN (co.email_active_normalized, co.email_2_normalized))
           OR (v_type = 'phone' AND v_norm IN (co.phone_direct_normalized, co.phone_2_normalized))
        LIMIT 1;

        INSERT INTO public.removed_entries (identity_type, normalized_value, reason, source, created_by)
        VALUES (v_type, v_norm, COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste'), 'deliverability', p_actor_id)
        ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
        v_inserted := FOUND;

        raw_value := v_raw;
        identity_type := v_type;
        normalized_value := v_norm;
        company_name := v_company_name;
        contact_name := NULLIF(btrim(v_contact_name), '');
        was_new := v_inserted;
        RETURN NEXT;

        v_company_name := NULL;
        v_contact_name := NULL;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
