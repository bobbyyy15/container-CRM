-- 049_company_level_removal_and_block.sql
-- Enables company-level removal / block across the CRM so that when a customer opts out
-- and requests to exclude their entire organization, all associated contacts and records
-- are cascaded to removed status and permanently suppressed from outreach.

-- 1. Drop existing signature to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT);

-- 2. Create updated remove_pipeline_entry with p_block_company flag
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

    -- If company-level opt-out / block is selected:
    IF p_block_company AND v_company_id IS NOT NULL THEN
        -- 1. Insert company-level suppression record
        INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
        VALUES (v_company_id, NULL, 'company', btrim(p_reason), p_stage, p_actor_id)
        RETURNING * INTO v_removed;

        -- 2. Also suppress individual contact if present
        IF v_contact_id IS NOT NULL THEN
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'contact', btrim(p_reason), p_stage, p_actor_id)
            ON CONFLICT DO NOTHING;
        END IF;

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
        INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
        VALUES (v_company_id, v_contact_id, 'contact', btrim(p_reason), p_stage, p_actor_id)
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

NOTIFY pgrst, 'reload schema';
