-- 042_fix_bulk_removed_ambiguity.sql
--
-- Migration 040 broke bulk_add_removed_entries with
--   "column reference \"identity_type\" is ambiguous"
--
-- The function's RETURNS TABLE columns (identity_type, normalized_value, ...) are
-- plpgsql variables inside the body. The original ON CONFLICT ... DO NOTHING
-- tolerated that, but adding a DO UPDATE made Postgres resolve the conflict-target
-- names against both the variables and the table columns. An ON CONFLICT target
-- cannot be table-qualified, so the collision can't be resolved in place.
--
-- Replaced with an explicit lookup-then-insert-or-update, where every column
-- reference is qualified and nothing is ambiguous. Same behaviour: insert when new,
-- backfill the client linkage when the identity is already suppressed.

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
    v_existing_id UUID;
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

        -- Resolve the identity to a real contact/company so the suppression row
        -- carries the whole client, not just the pasted string.
        SELECT co.id, c.id, c.name, (co.first_name || ' ' || COALESCE(co.last_name, ''))
        INTO v_contact_id, v_company_id, v_company_name, v_contact_name
        FROM public.contacts co
        LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id AND cc.is_primary = true
        LEFT JOIN public.companies c ON c.id = cc.company_id
        WHERE (v_type = 'email' AND v_norm IN (co.email_active_normalized, co.email_2_normalized))
           OR (v_type = 'phone' AND v_norm IN (co.phone_direct_normalized, co.phone_2_normalized))
        LIMIT 1;

        SELECT re.id INTO v_existing_id
        FROM public.removed_entries re
        WHERE re.identity_type = v_type
          AND re.normalized_value = v_norm
        LIMIT 1;

        IF v_existing_id IS NULL THEN
            INSERT INTO public.removed_entries (
                identity_type, normalized_value, company_id, contact_id, reason, source, created_by
            )
            VALUES (
                v_type, v_norm, v_company_id, v_contact_id,
                COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste'), 'deliverability', p_actor_id
            );
            v_inserted := TRUE;
        ELSE
            -- Already suppressed; fill in linkage that earlier pastes didn't capture.
            UPDATE public.removed_entries re
            SET company_id = COALESCE(re.company_id, v_company_id),
                contact_id = COALESCE(re.contact_id, v_contact_id)
            WHERE re.id = v_existing_id;
            v_inserted := FALSE;
        END IF;

        raw_value := v_raw;
        identity_type := v_type;
        normalized_value := v_norm;
        company_name := v_company_name;
        contact_name := NULLIF(btrim(v_contact_name), '');
        was_new := v_inserted;
        RETURN NEXT;

        v_company_id := NULL; v_contact_id := NULL;
        v_company_name := NULL; v_contact_name := NULL;
        v_existing_id := NULL;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
