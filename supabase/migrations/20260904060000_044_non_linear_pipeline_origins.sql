-- 044_non_linear_pipeline_origins.sql
--
-- Make the already-supported direct Warm Lead and direct Inquiry entry paths explicit,
-- and allow a direct Inquiry to be added to Warm Leads later without fabricating a
-- Prospect or changing the Inquiry's validation state.

ALTER TABLE public.warm_leads
    ADD COLUMN IF NOT EXISTS source_inquiry_id UUID
        REFERENCES public.inquiries(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS warm_leads_source_inquiry_unique_idx
    ON public.warm_leads (source_inquiry_id)
    WHERE source_inquiry_id IS NOT NULL;

-- Generated origins cannot drift away from the actual relationship columns. Existing
-- rows are classified automatically when the migration is applied.
ALTER TABLE public.warm_leads
    ADD COLUMN IF NOT EXISTS entry_origin TEXT GENERATED ALWAYS AS (
        CASE
            WHEN source_inquiry_id IS NOT NULL THEN 'inquiry_backfill'
            WHEN source_prospect_id IS NOT NULL THEN 'prospect_conversion'
            ELSE 'direct'
        END
    ) STORED;

ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS entry_origin TEXT GENERATED ALWAYS AS (
        CASE
            WHEN source_warm_lead_id IS NOT NULL THEN 'warm_lead_conversion'
            ELSE 'direct'
        END
    ) STORED;

-- The reverse relationship is intentionally optional. It creates one active Warm Lead
-- for a direct Inquiry, leaves the Inquiry untouched, and is idempotent under both
-- repeated requests and concurrent clicks.
CREATE OR REPLACE FUNCTION public.create_warm_lead_from_inquiry(
    p_inquiry_id UUID,
    p_actor_id UUID
)
RETURNS SETOF public.warm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inquiry public.inquiries%ROWTYPE;
    v_warm_lead public.warm_leads%ROWTYPE;
    v_actor_pic_id UUID;
    v_actor_role TEXT;
    v_actor_status TEXT;
BEGIN
    SELECT profile.role, profile.status, pic.id
    INTO v_actor_role, v_actor_status, v_actor_pic_id
    FROM public.profiles profile
    LEFT JOIN public.pics pic
      ON pic.profile_id = profile.id
     AND pic.status = 'active'
    WHERE profile.id = p_actor_id;

    IF v_actor_status IS DISTINCT FROM 'active'
       OR v_actor_role NOT IN ('admin', 'sales_manager') THEN
        RAISE EXCEPTION 'Only an active Admin or Sales Manager can add an inquiry to Warm Leads'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inquiry
    FROM public.inquiries
    WHERE id = p_inquiry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_pic_id IS NULL OR v_inquiry.pic_id IS DISTINCT FROM v_actor_pic_id THEN
        RAISE EXCEPTION 'You can only add inquiries owned by your own PIC to Warm Leads'
            USING ERRCODE = '42501';
    END IF;

    -- An Inquiry that already came from a Warm Lead already has the relationship the
    -- caller is asking for. Return it rather than creating a duplicate.
    IF v_inquiry.source_warm_lead_id IS NOT NULL THEN
        SELECT * INTO v_warm_lead
        FROM public.warm_leads
        WHERE id = v_inquiry.source_warm_lead_id;
        RETURN NEXT v_warm_lead;
        RETURN;
    END IF;

    SELECT * INTO v_warm_lead
    FROM public.warm_leads
    WHERE source_inquiry_id = v_inquiry.id;

    IF FOUND THEN
        RETURN NEXT v_warm_lead;
        RETURN;
    END IF;

    INSERT INTO public.warm_leads (
        source_prospect_id,
        source_inquiry_id,
        company_id,
        contact_id,
        pic_id,
        status,
        notes,
        previous_inquiry_indicator,
        source,
        state_province,
        country
    ) VALUES (
        NULL,
        v_inquiry.id,
        v_inquiry.company_id,
        v_inquiry.contact_id,
        v_inquiry.pic_id,
        'active',
        'Added from direct inquiry ' || upper(left(v_inquiry.id::text, 8)),
        true,
        'Inquiry backfill',
        v_inquiry.state_province,
        v_inquiry.country
    )
    ON CONFLICT (source_inquiry_id) WHERE source_inquiry_id IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_warm_lead;

    IF v_warm_lead.id IS NULL THEN
        SELECT * INTO v_warm_lead
        FROM public.warm_leads
        WHERE source_inquiry_id = v_inquiry.id;
    ELSE
        INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
        VALUES (
            'inquiry',
            v_inquiry.id,
            'inquiry_added_to_warm_leads',
            p_actor_id,
            jsonb_build_object('warm_lead_id', v_warm_lead.id)
        );

        INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
        VALUES (
            'warm_lead',
            v_warm_lead.id,
            'warm_lead_created_from_inquiry',
            p_actor_id,
            jsonb_build_object('inquiry_id', v_inquiry.id)
        );
    END IF;

    RETURN NEXT v_warm_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.create_warm_lead_from_inquiry(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_warm_lead_from_inquiry(UUID, UUID)
    TO service_role;

NOTIFY pgrst, 'reload schema';
