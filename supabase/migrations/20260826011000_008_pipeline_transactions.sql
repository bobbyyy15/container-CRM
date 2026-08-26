-- Transactional and idempotent Prospect -> Warm Lead -> Inquiry transitions.

CREATE UNIQUE INDEX warm_leads_source_prospect_unique_idx
    ON public.warm_leads (source_prospect_id)
    WHERE source_prospect_id IS NOT NULL;

CREATE UNIQUE INDEX inquiries_source_warm_lead_unique_idx
    ON public.inquiries (source_warm_lead_id)
    WHERE source_warm_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.convert_prospect_to_warm_lead(
    p_prospect_id UUID,
    p_actor_id UUID
)
RETURNS SETOF public.warm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prospect public.prospect_clients%ROWTYPE;
    v_warm_lead public.warm_leads%ROWTYPE;
BEGIN
    SELECT * INTO v_prospect
    FROM public.prospect_clients
    WHERE id = p_prospect_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_prospect.category <> 'Proceed' THEN
        RAISE EXCEPTION 'Prospect is not eligible for conversion' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_warm_lead
    FROM public.warm_leads
    WHERE source_prospect_id = p_prospect_id;

    IF FOUND THEN
        RETURN NEXT v_warm_lead;
        RETURN;
    END IF;

    INSERT INTO public.warm_leads (
        source_prospect_id,
        company_id,
        contact_id,
        pic_id,
        status
    ) VALUES (
        v_prospect.id,
        v_prospect.company_id,
        v_prospect.contact_id,
        v_prospect.pic_id,
        'new'
    )
    RETURNING * INTO v_warm_lead;

    INSERT INTO public.domain_events (
        entity_type,
        entity_id,
        event_type,
        actor_id,
        payload
    ) VALUES (
        'prospect',
        v_prospect.id,
        'converted_to_warm_lead',
        p_actor_id,
        jsonb_build_object('warm_lead_id', v_warm_lead.id)
    );

    RETURN NEXT v_warm_lead;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inquiry_from_warm_lead(
    p_warm_lead_id UUID,
    p_actor_id UUID,
    p_requirements TEXT DEFAULT NULL
)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_warm_lead public.warm_leads%ROWTYPE;
    v_inquiry public.inquiries%ROWTYPE;
BEGIN
    SELECT * INTO v_warm_lead
    FROM public.warm_leads
    WHERE id = p_warm_lead_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_inquiry
    FROM public.inquiries
    WHERE source_warm_lead_id = p_warm_lead_id;

    IF FOUND THEN
        RETURN NEXT v_inquiry;
        RETURN;
    END IF;

    INSERT INTO public.inquiries (
        source_warm_lead_id,
        company_id,
        contact_id,
        pic_id,
        requirements,
        status
    ) VALUES (
        v_warm_lead.id,
        v_warm_lead.company_id,
        v_warm_lead.contact_id,
        v_warm_lead.pic_id,
        p_requirements,
        'Under Review'
    )
    RETURNING * INTO v_inquiry;

    INSERT INTO public.domain_events (
        entity_type,
        entity_id,
        event_type,
        actor_id,
        payload
    ) VALUES (
        'warm_lead',
        v_warm_lead.id,
        'inquiry_created',
        p_actor_id,
        jsonb_build_object('inquiry_id', v_inquiry.id)
    );

    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
