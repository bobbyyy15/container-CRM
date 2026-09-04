-- 052_granular_restore_removed_entry.sql
-- 1. Fix is_pipeline_identity_removed to only treat pure company records (contact_id IS NULL)
--    as company-wide suppressions, and check exact normalized email/phone values.
-- 2. Update restore_removed_entry to thoroughly remove suppressions and unblock records.

-- 1. Update is_pipeline_identity_removed
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
        WHERE (p_company_id IS NOT NULL AND r.identity_type = 'company' AND r.company_id = p_company_id AND r.contact_id IS NULL)
           OR (p_contact_id IS NOT NULL AND r.contact_id = p_contact_id)
           OR (r.identity_type = 'email' AND r.normalized_value IS NOT NULL AND (
                (p_email_1 IS NOT NULL AND NULLIF(btrim(p_email_1), '') IS NOT NULL AND r.normalized_value = public.normalize_email(p_email_1))
             OR (p_email_2 IS NOT NULL AND NULLIF(btrim(p_email_2), '') IS NOT NULL AND r.normalized_value = public.normalize_email(p_email_2))
           ))
           OR (r.identity_type = 'phone' AND r.normalized_value IS NOT NULL AND (
                (p_phone_1 IS NOT NULL AND NULLIF(btrim(p_phone_1), '') IS NOT NULL AND r.normalized_value = public.normalize_phone(p_phone_1))
             OR (p_phone_2 IS NOT NULL AND NULLIF(btrim(p_phone_2), '') IS NOT NULL AND r.normalized_value = public.normalize_phone(p_phone_2))
           ))
    );
$$;

REVOKE ALL ON FUNCTION public.is_pipeline_identity_removed(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pipeline_identity_removed(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 2. Update restore_removed_entry
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
    v_norm TEXT;
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
    v_norm := v_entry.normalized_value;

    IF v_type = 'company' AND v_company_id IS NOT NULL AND v_contact_id IS NULL THEN
        -- Restoring a pure company-level entry: unblock all entries for this company
        DELETE FROM public.removed_entries
        WHERE company_id = v_company_id OR id = p_removed_id;

        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE company_id = v_company_id AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSIF v_contact_id IS NOT NULL THEN
        -- Restoring a specific contact: delete suppressions for this contact
        DELETE FROM public.removed_entries
        WHERE contact_id = v_contact_id OR id = p_removed_id;

        IF v_norm IS NOT NULL THEN
            DELETE FROM public.removed_entries WHERE normalized_value = v_norm;
        END IF;

        -- Free contact from any parent blanket company suppression
        IF v_company_id IS NOT NULL THEN
            DELETE FROM public.removed_entries
            WHERE company_id = v_company_id AND contact_id IS NULL;
        END IF;

        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE contact_id = v_contact_id AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE contact_id = v_contact_id AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE contact_id = v_contact_id AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSIF v_company_id IS NOT NULL THEN
        DELETE FROM public.removed_entries
        WHERE company_id = v_company_id OR id = p_removed_id;

        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE company_id = v_company_id AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSE
        DELETE FROM public.removed_entries WHERE id = p_removed_id;
        IF v_norm IS NOT NULL THEN
            DELETE FROM public.removed_entries WHERE normalized_value = v_norm;
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
