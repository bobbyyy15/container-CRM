-- 048_smart_bulk_removed_enrichment.sql
-- Ensures that bulk adding removed entries (by pasting email, phone, or name)
-- pulls out the entire client record (company, contact name, phone, email, stage)
-- identical to removing via the clickable row action.

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
    v_client RECORD;
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

        -- 1. Use smart client lookup to find existing company & contact details
        SELECT * INTO v_client FROM public.lookup_client_by_identity(v_raw) LIMIT 1;

        IF v_client IS NOT NULL AND (v_client.contact_id IS NOT NULL OR v_client.company_id IS NOT NULL) THEN
            v_contact_id := v_client.contact_id;
            v_company_id := v_client.company_id;
            v_company_name := v_client.company_name;
            v_contact_name := v_client.contact_person;
        ELSE
            -- Fallback direct lookup on contacts table
            SELECT co.id, c.id, c.name, NULLIF(btrim(co.first_name || ' ' || COALESCE(co.last_name, '')), '')
            INTO v_contact_id, v_company_id, v_company_name, v_contact_name
            FROM public.contacts co
            LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id
            LEFT JOIN public.companies c ON c.id = cc.company_id
            WHERE (v_type = 'email' AND (
                co.email_active_normalized = v_norm 
                OR co.email_2_normalized = v_norm
                OR co.email_active ILIKE v_raw
                OR co.email_2 ILIKE v_raw
            ))
            OR (v_type = 'phone' AND (
                co.phone_direct_normalized = v_norm 
                OR co.phone_2_normalized = v_norm
                OR co.phone_direct LIKE '%' || v_norm || '%'
                OR co.phone_2 LIKE '%' || v_norm || '%'
            ))
            ORDER BY cc.is_primary DESC NULLS LAST
            LIMIT 1;
        END IF;

        -- 2. Check if this identity is already in removed_entries
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
            -- Already suppressed; backfill company/contact linkage if missing
            UPDATE public.removed_entries re
            SET company_id = COALESCE(re.company_id, v_company_id),
                contact_id = COALESCE(re.contact_id, v_contact_id)
            WHERE re.id = v_existing_id;
            v_inserted := FALSE;
        END IF;

        -- 3. Transition any active pipeline stages to removed
        IF v_company_id IS NOT NULL OR v_contact_id IS NOT NULL THEN
            UPDATE public.prospect_clients
            SET lifecycle_status = 'removed', removed_at = NOW()
            WHERE (company_id = v_company_id OR (v_contact_id IS NOT NULL AND contact_id = v_contact_id))
              AND lifecycle_status = 'active';

            UPDATE public.warm_leads
            SET status = 'removed', removed_at = NOW()
            WHERE (company_id = v_company_id OR (v_contact_id IS NOT NULL AND contact_id = v_contact_id))
              AND status = 'active';

            UPDATE public.inquiries
            SET status = 'Removed'
            WHERE (company_id = v_company_id OR (v_contact_id IS NOT NULL AND contact_id = v_contact_id))
              AND status NOT IN ('Removed', 'Won', 'Converted to Sale');
        END IF;

        raw_value := v_raw;
        identity_type := v_type;
        normalized_value := v_norm;
        company_name := v_company_name;
        contact_name := v_contact_name;
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

-- Retroactive backfill for existing removed_entries with missing company_id or contact_id
DO $$
DECLARE
    r RECORD;
    v_match RECORD;
BEGIN
    FOR r IN SELECT id, identity_type, normalized_value FROM public.removed_entries WHERE company_id IS NULL OR contact_id IS NULL LOOP
        SELECT * INTO v_match FROM public.lookup_client_by_identity(r.normalized_value) LIMIT 1;
        IF v_match IS NOT NULL AND (v_match.company_id IS NOT NULL OR v_match.contact_id IS NOT NULL) THEN
            UPDATE public.removed_entries
            SET company_id = COALESCE(company_id, v_match.company_id),
                contact_id = COALESCE(contact_id, v_match.contact_id)
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
