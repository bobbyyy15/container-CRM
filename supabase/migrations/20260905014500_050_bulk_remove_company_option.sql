-- 050_bulk_remove_company_option.sql
-- Adds p_block_company parameter to bulk_add_removed_entries so that pasting details into
-- the Removed Sheet allows users to cascade removal and block all customers on the same company.

-- 1. Drop old function signatures to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS public.bulk_add_removed_entries(TEXT[], TEXT, UUID);
DROP FUNCTION IF EXISTS public.bulk_add_removed_entries(TEXT[], TEXT, UUID, BOOLEAN);

-- 2. Create updated bulk_add_removed_entries
CREATE OR REPLACE FUNCTION public.bulk_add_removed_entries(
    p_identifiers TEXT[],
    p_reason TEXT,
    p_actor_id UUID,
    p_block_company BOOLEAN DEFAULT false
)
RETURNS TABLE (
    raw_value TEXT,
    identity_type TEXT,
    normalized_value TEXT,
    company_name TEXT,
    contact_name TEXT,
    was_new BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_raw TEXT;
    v_type TEXT;
    v_norm TEXT;
    v_company_id UUID;
    v_contact_id UUID;
    v_company_name TEXT;
    v_contact_name TEXT;
    v_existing_id UUID;
    v_inserted BOOLEAN;
    v_client RECORD;
    v_phone_norm TEXT;
BEGIN
    FOREACH v_raw IN ARRAY p_identifiers LOOP
        v_raw := btrim(v_raw);
        CONTINUE WHEN v_raw = '';

        -- Determine initial identity classification
        IF v_raw LIKE '%@%' THEN
            v_type := 'email';
            v_norm := public.normalize_email(v_raw);
        ELSE
            v_phone_norm := public.normalize_phone(v_raw);
            IF v_phone_norm IS NOT NULL AND length(v_phone_norm) >= 7 THEN
                v_type := 'phone';
                v_norm := v_phone_norm;
            ELSE
                v_type := 'company';
                v_norm := public.normalize_identity_text(v_raw);
            END IF;
        END IF;

        -- 1. Use smart client lookup to resolve company & contact details
        SELECT * INTO v_client FROM public.lookup_client_by_identity(v_raw) LIMIT 1;

        IF v_client IS NOT NULL AND (v_client.contact_id IS NOT NULL OR v_client.company_id IS NOT NULL) THEN
            v_contact_id := v_client.contact_id;
            v_company_id := v_client.company_id;
            v_company_name := v_client.company_name;
            v_contact_name := v_client.contact_person;
        ELSE
            -- Direct company lookup fallback
            SELECT c.id, c.name INTO v_company_id, v_company_name
            FROM public.companies c
            WHERE (v_norm IS NOT NULL AND c.name_normalized = v_norm)
               OR c.name ILIKE '%' || v_raw || '%'
            ORDER BY length(c.name) ASC
            LIMIT 1;

            IF v_company_id IS NULL THEN
                -- Direct contacts table lookup fallback
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
        END IF;

        -- 2. Suppression record handling
        IF p_block_company AND v_company_id IS NOT NULL THEN
            -- Check if company block already exists
            SELECT re.id INTO v_existing_id
            FROM public.removed_entries re
            WHERE re.identity_type = 'company'
              AND re.company_id = v_company_id
            LIMIT 1;

            IF v_existing_id IS NULL THEN
                INSERT INTO public.removed_entries (
                    identity_type, normalized_value, company_id, contact_id, reason, source, created_by
                )
                VALUES (
                    'company', v_company_id::text, v_company_id, NULL,
                    COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste (Company Block)'), 'deliverability', p_actor_id
                );
                v_inserted := TRUE;
            ELSE
                v_inserted := FALSE;
            END IF;

            -- Also insert contact or specific identity suppression if available
            IF v_contact_id IS NOT NULL OR (v_norm IS NOT NULL AND v_type IN ('email', 'phone')) THEN
                INSERT INTO public.removed_entries (
                    identity_type, normalized_value, company_id, contact_id, reason, source, created_by
                )
                VALUES (
                    v_type, COALESCE(v_norm, v_raw), v_company_id, v_contact_id,
                    COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste (Company Block)'), 'deliverability', p_actor_id
                )
                ON CONFLICT DO NOTHING;
            END IF;

            -- 3. Cascade remove ALL pipeline records across the entire company
            UPDATE public.prospect_clients
            SET lifecycle_status = 'removed', removed_at = NOW()
            WHERE company_id = v_company_id AND lifecycle_status != 'removed';

            UPDATE public.warm_leads
            SET status = 'removed', removed_at = NOW()
            WHERE company_id = v_company_id AND status != 'removed';

            UPDATE public.inquiries
            SET status = 'Removed'
            WHERE company_id = v_company_id AND status NOT IN ('Removed', 'Won', 'Converted to Sale');

            UPDATE public.quotations
            SET status = 'Rejected'
            WHERE company_id = v_company_id AND status NOT IN ('Converted', 'Rejected');

        ELSE
            -- Normal contact / identity suppression
            SELECT re.id INTO v_existing_id
            FROM public.removed_entries re
            WHERE re.identity_type = v_type
              AND re.normalized_value = COALESCE(v_norm, v_raw)
            LIMIT 1;

            IF v_existing_id IS NULL THEN
                INSERT INTO public.removed_entries (
                    identity_type, normalized_value, company_id, contact_id, reason, source, created_by
                )
                VALUES (
                    v_type, COALESCE(v_norm, v_raw), v_company_id, v_contact_id,
                    COALESCE(NULLIF(btrim(p_reason), ''), 'Bulk paste'), 'deliverability', p_actor_id
                );
                v_inserted := TRUE;
            ELSE
                UPDATE public.removed_entries re
                SET company_id = COALESCE(re.company_id, v_company_id),
                    contact_id = COALESCE(re.contact_id, v_contact_id)
                WHERE re.id = v_existing_id;
                v_inserted := FALSE;
            END IF;

            -- Cascade remove active pipeline stages for this specific entity
            IF v_contact_id IS NOT NULL THEN
                UPDATE public.prospect_clients
                SET lifecycle_status = 'removed', removed_at = NOW()
                WHERE contact_id = v_contact_id AND lifecycle_status = 'active';

                UPDATE public.warm_leads
                SET status = 'removed', removed_at = NOW()
                WHERE contact_id = v_contact_id AND status = 'active';

                UPDATE public.inquiries
                SET status = 'Removed'
                WHERE contact_id = v_contact_id AND status NOT IN ('Removed', 'Won', 'Converted to Sale');
            ELSIF v_company_id IS NOT NULL THEN
                UPDATE public.prospect_clients
                SET lifecycle_status = 'removed', removed_at = NOW()
                WHERE company_id = v_company_id AND lifecycle_status = 'active';

                UPDATE public.warm_leads
                SET status = 'removed', removed_at = NOW()
                WHERE company_id = v_company_id AND status = 'active';

                UPDATE public.inquiries
                SET status = 'Removed'
                WHERE company_id = v_company_id AND status NOT IN ('Removed', 'Won', 'Converted to Sale');
            END IF;
        END IF;

        raw_value := v_raw;
        identity_type := CASE WHEN p_block_company AND v_company_id IS NOT NULL THEN 'company' ELSE v_type END;
        normalized_value := COALESCE(v_norm, v_raw);
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

REVOKE ALL ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_add_removed_entries(TEXT[], TEXT, UUID, BOOLEAN) TO service_role;

-- 3. Update is_pipeline_identity_removed to respect company-level vs contact-level suppression
CREATE OR REPLACE FUNCTION public.is_pipeline_identity_removed(
    p_company_id UUID,
    p_contact_id UUID,
    p_email_1 TEXT DEFAULT NULL,
    p_email_2 TEXT DEFAULT NULL,
    p_phone_1 TEXT DEFAULT NULL,
    p_phone_2 TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.removed_entries r
        WHERE (r.identity_type = 'company' AND r.company_id = p_company_id)
           OR (r.identity_type = 'contact' AND r.contact_id = p_contact_id)
           OR (r.contact_id IS NOT NULL AND r.contact_id = p_contact_id)
           OR (r.identity_type = 'email' AND r.normalized_value IN (
                public.normalize_email(p_email_1), public.normalize_email(p_email_2)
           ))
           OR (r.identity_type = 'phone' AND r.normalized_value IN (
                public.normalize_phone(p_phone_1), public.normalize_phone(p_phone_2)
           ))
    );
$$;

REVOKE ALL ON FUNCTION public.is_pipeline_identity_removed(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pipeline_identity_removed(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
