-- 051_list_all_company_contacts_and_restore_removed.sql
-- 1. Ensures that when a company is blocked, all individual contacts belonging to that company
--    are listed on the Removed Sheet with their contact names, phones, and emails.
-- 2. Adds restore_removed_entry to allow restoring suppressed records back to active pipeline stages.

-- 1. Drop old function signatures
DROP FUNCTION IF EXISTS public.restore_removed_entry(UUID, UUID);
DROP FUNCTION IF EXISTS public.bulk_add_removed_entries(TEXT[], TEXT, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT, BOOLEAN);

-- 2. Updated remove_pipeline_entry with full company contact expansion
CREATE OR REPLACE FUNCTION public.remove_pipeline_entry(
    p_stage TEXT,
    p_entity_id UUID,
    p_actor_id UUID,
    p_reason TEXT,
    p_block_company BOOLEAN DEFAULT false
)
RETURNS public.removed_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_removed public.removed_entries%ROWTYPE;
    v_contact_row RECORD;
    v_company_name TEXT;
BEGIN
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A removal reason is required';
    END IF;

    IF p_stage = 'prospect' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.prospect_clients WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.prospect_clients SET lifecycle_status = 'removed', removed_at = NOW() WHERE id = p_entity_id;
    ELSIF p_stage = 'warm_lead' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.warm_leads WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.warm_leads SET status = 'removed', removed_at = NOW() WHERE id = p_entity_id;
    ELSIF p_stage = 'inquiry' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.inquiries WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.inquiries SET status = 'Removed' WHERE id = p_entity_id;
    ELSIF p_stage = 'quotation' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.quotations WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'P0002'; END IF;
        IF (SELECT status FROM public.quotations WHERE id = p_entity_id) = 'Converted' THEN
            RAISE EXCEPTION 'Converted quotations cannot be removed' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.quotations SET status = 'Rejected' WHERE id = p_entity_id;
    ELSE
        RAISE EXCEPTION 'Unsupported pipeline stage';
    END IF;

    IF v_company_id IS NOT NULL THEN
        SELECT name INTO v_company_name FROM public.companies WHERE id = v_company_id;
    END IF;

    -- If company-level opt-out / block is selected:
    IF p_block_company AND v_company_id IS NOT NULL THEN
        -- 1. Insert parent company suppression record
        INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
        VALUES (v_company_id, NULL, 'company', v_company_id::text, btrim(p_reason), p_stage, p_actor_id)
        ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
        DO UPDATE SET reason = EXCLUDED.reason
        RETURNING * INTO v_removed;

        -- 2. Insert suppression rows for ALL contacts belonging to this company so they all appear listed on the Removed Sheet
        FOR v_contact_row IN (
            SELECT DISTINCT c.id, c.first_name, c.last_name, c.email_active_normalized, c.phone_direct_normalized
            FROM public.contacts c
            WHERE c.id IN (
                SELECT contact_id FROM public.company_contacts WHERE company_id = v_company_id
                UNION
                SELECT contact_id FROM public.prospect_clients WHERE company_id = v_company_id AND contact_id IS NOT NULL
                UNION
                SELECT contact_id FROM public.warm_leads WHERE company_id = v_company_id AND contact_id IS NOT NULL
                UNION
                SELECT contact_id FROM public.inquiries WHERE company_id = v_company_id AND contact_id IS NOT NULL
                UNION
                SELECT contact_id FROM public.sales WHERE company_id = v_company_id AND contact_id IS NOT NULL
            )
        ) LOOP
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
            VALUES (
                v_company_id, v_contact_row.id, 'company',
                v_contact_row.id::text,
                btrim(p_reason), p_stage, p_actor_id
            )
            ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
            DO UPDATE SET company_id = EXCLUDED.company_id, contact_id = EXCLUDED.contact_id, reason = EXCLUDED.reason;

            IF v_contact_row.email_active_normalized IS NOT NULL THEN
                INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
                VALUES (v_company_id, v_contact_row.id, 'email', v_contact_row.email_active_normalized, btrim(p_reason), p_stage, p_actor_id)
                ON CONFLICT DO NOTHING;
            END IF;

            IF v_contact_row.phone_direct_normalized IS NOT NULL THEN
                INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
                VALUES (v_company_id, v_contact_row.id, 'phone', v_contact_row.phone_direct_normalized, btrim(p_reason), p_stage, p_actor_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;

        -- 3. Cascade remove all related pipeline entries for that company
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
        INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
        VALUES (v_company_id, v_contact_id, 'contact', COALESCE(v_contact_id::text, v_company_id::text), btrim(p_reason), p_stage, p_actor_id)
        ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
        DO UPDATE SET reason = EXCLUDED.reason, company_id = EXCLUDED.company_id, contact_id = EXCLUDED.contact_id
        RETURNING * INTO v_removed;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (p_stage, p_entity_id, 'removed', p_actor_id, jsonb_build_object(
        'reason', btrim(p_reason),
        'removed_entry_id', v_removed.id,
        'blocked_company', p_block_company
    ));
    RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT, BOOLEAN) TO service_role;

-- 3. Updated bulk_add_removed_entries with full company contact expansion
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
    v_contact_row RECORD;
    v_reason_text TEXT;
BEGIN
    v_reason_text := COALESCE(NULLIF(btrim(p_reason), ''), CASE WHEN p_block_company THEN 'Bulk paste (Company Block)' ELSE 'Bulk paste' END);

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
            -- Check if parent company block already exists
            SELECT re.id INTO v_existing_id
            FROM public.removed_entries re
            WHERE re.identity_type = 'company'
              AND re.normalized_value = v_company_id::text
            LIMIT 1;

            IF v_existing_id IS NULL THEN
                INSERT INTO public.removed_entries (
                    identity_type, normalized_value, company_id, contact_id, reason, source, created_by
                )
                VALUES (
                    'company', v_company_id::text, v_company_id, NULL,
                    v_reason_text, 'deliverability', p_actor_id
                )
                ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
                DO UPDATE SET reason = EXCLUDED.reason;
                v_inserted := TRUE;
            ELSE
                v_inserted := FALSE;
            END IF;

            -- Expand all contacts in this company so every person appears on the Removed Sheet
            FOR v_contact_row IN (
                SELECT DISTINCT c.id, c.first_name, c.last_name, c.email_active_normalized, c.phone_direct_normalized
                FROM public.contacts c
                WHERE c.id IN (
                    SELECT contact_id FROM public.company_contacts WHERE company_id = v_company_id
                    UNION
                    SELECT contact_id FROM public.prospect_clients WHERE company_id = v_company_id AND contact_id IS NOT NULL
                    UNION
                    SELECT contact_id FROM public.warm_leads WHERE company_id = v_company_id AND contact_id IS NOT NULL
                    UNION
                    SELECT contact_id FROM public.inquiries WHERE company_id = v_company_id AND contact_id IS NOT NULL
                    UNION
                    SELECT contact_id FROM public.sales WHERE company_id = v_company_id AND contact_id IS NOT NULL
                )
            ) LOOP
                INSERT INTO public.removed_entries (
                    company_id, contact_id, identity_type, normalized_value, reason, source, created_by
                )
                VALUES (
                    v_company_id, v_contact_row.id, 'company',
                    v_contact_row.id::text,
                    v_reason_text, 'deliverability', p_actor_id
                )
                ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
                DO UPDATE SET company_id = EXCLUDED.company_id, contact_id = EXCLUDED.contact_id, reason = EXCLUDED.reason;

                IF v_contact_row.email_active_normalized IS NOT NULL THEN
                    INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
                    VALUES (v_company_id, v_contact_row.id, 'email', v_contact_row.email_active_normalized, v_reason_text, 'deliverability', p_actor_id)
                    ON CONFLICT DO NOTHING;
                END IF;

                IF v_contact_row.phone_direct_normalized IS NOT NULL THEN
                    INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
                    VALUES (v_company_id, v_contact_row.id, 'phone', v_contact_row.phone_direct_normalized, v_reason_text, 'deliverability', p_actor_id)
                    ON CONFLICT DO NOTHING;
                END IF;
            END LOOP;

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
                    v_reason_text, 'deliverability', p_actor_id
                )
                ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL
                DO UPDATE SET company_id = EXCLUDED.company_id, contact_id = EXCLUDED.contact_id, reason = EXCLUDED.reason;
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

-- 4. Create restore_removed_entry function
CREATE OR REPLACE FUNCTION public.restore_removed_entry(
    p_removed_id UUID,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entry public.removed_entries%ROWTYPE;
    v_company_id UUID;
    v_contact_id UUID;
    v_type TEXT;
    v_restored_prospects INT := 0;
    v_restored_warm_leads INT := 0;
    v_restored_inquiries INT := 0;
BEGIN
    SELECT * INTO v_entry FROM public.removed_entries WHERE id = p_removed_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Removed entry not found' USING ERRCODE = 'P0002';
    END IF;

    v_company_id := v_entry.company_id;
    v_contact_id := v_entry.contact_id;
    v_type := v_entry.identity_type;

    IF v_type = 'company' AND v_company_id IS NOT NULL THEN
        -- Delete all suppression entries for this company
        DELETE FROM public.removed_entries
        WHERE company_id = v_company_id;

        -- Reactivate prospect clients
        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        -- Reactivate warm leads
        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        -- Reactivate inquiries (set back to New)
        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE company_id = v_company_id AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSE
        -- Delete this specific removed_entries row
        DELETE FROM public.removed_entries WHERE id = p_removed_id;

        IF v_contact_id IS NOT NULL THEN
            -- Also delete any matching phone/email suppression for this contact
            DELETE FROM public.removed_entries WHERE contact_id = v_contact_id;

            -- Reactivate prospect clients
            WITH reactivated AS (
                UPDATE public.prospect_clients
                SET lifecycle_status = 'active', removed_at = NULL
                WHERE contact_id = v_contact_id AND lifecycle_status = 'removed'
                RETURNING id
            )
            SELECT count(*) INTO v_restored_prospects FROM reactivated;

            -- Reactivate warm leads
            WITH reactivated AS (
                UPDATE public.warm_leads
                SET status = 'active', removed_at = NULL
                WHERE contact_id = v_contact_id AND status = 'removed'
                RETURNING id
            )
            SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

            -- Reactivate inquiries
            WITH reactivated AS (
                UPDATE public.inquiries
                SET status = 'New'
                WHERE contact_id = v_contact_id AND status = 'Removed'
                RETURNING id
            )
            SELECT count(*) INTO v_restored_inquiries FROM reactivated;

        ELSIF v_company_id IS NOT NULL THEN
            -- Reactivate prospect clients
            WITH reactivated AS (
                UPDATE public.prospect_clients
                SET lifecycle_status = 'active', removed_at = NULL
                WHERE company_id = v_company_id AND lifecycle_status = 'removed'
                RETURNING id
            )
            SELECT count(*) INTO v_restored_prospects FROM reactivated;
        END IF;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('removed_entry', p_removed_id, 'restored', p_actor_id, jsonb_build_object(
        'identity_type', v_type,
        'company_id', v_company_id,
        'contact_id', v_contact_id,
        'restored_prospects', v_restored_prospects,
        'restored_warm_leads', v_restored_warm_leads,
        'restored_inquiries', v_restored_inquiries
    ));

    RETURN jsonb_build_object(
        'success', true,
        'restored_prospects', v_restored_prospects,
        'restored_warm_leads', v_restored_warm_leads,
        'restored_inquiries', v_restored_inquiries
    );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_removed_entry(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_removed_entry(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
