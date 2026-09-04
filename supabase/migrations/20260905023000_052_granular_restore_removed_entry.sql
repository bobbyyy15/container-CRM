-- 052_granular_restore_removed_entry.sql
-- Ensure restoring a contact row only restores that specific contact,
-- preserving suppressions for other contacts from the same company.

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

    IF v_contact_id IS NOT NULL THEN
        -- Delete suppression entries for this specific contact
        DELETE FROM public.removed_entries
        WHERE contact_id = v_contact_id OR id = p_removed_id;

        -- Remove blanket company suppression if present so this contact is freed
        IF v_company_id IS NOT NULL THEN
            DELETE FROM public.removed_entries
            WHERE company_id = v_company_id AND contact_id IS NULL;
        END IF;

        -- Reactivate prospect clients for this contact only
        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE contact_id = v_contact_id AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        -- Reactivate warm leads for this contact only
        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE contact_id = v_contact_id AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        -- Reactivate inquiries for this contact only
        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE contact_id = v_contact_id AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSIF v_company_id IS NOT NULL THEN
        -- Delete pure company suppression entry
        DELETE FROM public.removed_entries
        WHERE id = p_removed_id OR (company_id = v_company_id AND contact_id IS NULL);

        WITH reactivated AS (
            UPDATE public.prospect_clients
            SET lifecycle_status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND contact_id IS NULL AND lifecycle_status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_prospects FROM reactivated;

        WITH reactivated AS (
            UPDATE public.warm_leads
            SET status = 'active', removed_at = NULL
            WHERE company_id = v_company_id AND contact_id IS NULL AND status = 'removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_warm_leads FROM reactivated;

        WITH reactivated AS (
            UPDATE public.inquiries
            SET status = 'New'
            WHERE company_id = v_company_id AND contact_id IS NULL AND status = 'Removed'
            RETURNING id
        )
        SELECT count(*) INTO v_restored_inquiries FROM reactivated;

    ELSE
        -- Pure identifier suppression
        DELETE FROM public.removed_entries WHERE id = p_removed_id;
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
