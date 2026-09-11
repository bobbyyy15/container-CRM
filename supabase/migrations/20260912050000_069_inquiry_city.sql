-- An inquiry records the state and the country but never the city, so a customer's
-- address was half recorded at the moment someone was actually looking at it. The city
-- field on the New Inquiry form now reaches the company record.
--
-- Adding a parameter creates an overload rather than replacing the function -- the same
-- trap that made recording a sale answer 500 in migration 067 -- so the previous
-- signature is dropped at the end.

CREATE OR REPLACE FUNCTION public.create_manual_inquiry(
    p_actor_id UUID,
    p_warm_lead_id UUID DEFAULT NULL,
    p_company_name TEXT DEFAULT NULL,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_pic_id UUID DEFAULT NULL,
    p_container_size_id UUID DEFAULT NULL,
    p_container_condition_id UUID DEFAULT NULL,
    p_quantity INTEGER DEFAULT NULL,
    p_asking_price NUMERIC DEFAULT NULL,
    p_requirements TEXT DEFAULT NULL,
    p_special_requirements TEXT DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL,
    p_follow_up_date DATE DEFAULT NULL,
    p_needed_by_date DATE DEFAULT NULL,
    p_city TEXT DEFAULT NULL
)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_warm_lead public.warm_leads%ROWTYPE;
    v_company_id UUID;
    v_contact_id UUID;
    v_pic_id UUID;
    v_state TEXT;
    v_country TEXT;
    v_inquiry public.inquiries%ROWTYPE;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.container_sizes WHERE id = p_container_size_id) THEN
        RAISE EXCEPTION 'Unknown container size' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.container_conditions WHERE id = p_container_condition_id) THEN
        RAISE EXCEPTION 'Unknown container condition' USING ERRCODE = 'P0001';
    END IF;

    IF p_warm_lead_id IS NOT NULL THEN
        SELECT * INTO v_warm_lead FROM public.warm_leads WHERE id = p_warm_lead_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002'; END IF;
        v_company_id := v_warm_lead.company_id;
        v_contact_id := v_warm_lead.contact_id;
        v_pic_id := COALESCE(p_pic_id, v_warm_lead.pic_id);
        v_state := COALESCE(NULLIF(btrim(p_state_province), ''), v_warm_lead.state_province);
        v_country := COALESCE(NULLIF(btrim(p_country), ''), v_warm_lead.country);
    ELSE
        SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
        FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);
        v_pic_id := p_pic_id;
        v_state := NULLIF(btrim(p_state_province), '');
        v_country := NULLIF(btrim(p_country), '');
    END IF;

    -- find_or_create_company_contact takes no city, so record it on the company when it
    -- has none yet rather than overwriting an address already on file.
    IF NULLIF(btrim(p_city), '') IS NOT NULL AND v_company_id IS NOT NULL THEN
        UPDATE public.companies SET address_city = btrim(p_city)
        WHERE id = v_company_id AND (address_city IS NULL OR btrim(address_city) = '');
    END IF;

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.inquiries (
        source_warm_lead_id, company_id, contact_id, pic_id,
        container_size_id, container_condition_id, quantity, needed_by_date,
        asking_price, requirements, special_requirements, remarks, follow_up_date,
        state_province, country, status
    ) VALUES (
        p_warm_lead_id, v_company_id, v_contact_id, v_pic_id,
        p_container_size_id, p_container_condition_id, p_quantity, p_needed_by_date,
        p_asking_price, NULLIF(btrim(p_requirements), ''), NULLIF(btrim(p_special_requirements), ''),
        NULLIF(btrim(p_remarks), ''), p_follow_up_date,
        v_state, v_country, 'Pending Validation'
    )
    RETURNING * INTO v_inquiry;

    IF p_warm_lead_id IS NOT NULL THEN
        UPDATE public.warm_leads SET status = 'converted', converted_at = NOW() WHERE id = p_warm_lead_id;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (
        'inquiry', v_inquiry.id,
        CASE WHEN p_warm_lead_id IS NOT NULL THEN 'inquiry_created' ELSE 'inquiry_created_manually' END,
        p_actor_id, jsonb_build_object('warm_lead_id', p_warm_lead_id, 'company_id', v_company_id, 'contact_id', v_contact_id)
    );

    PERFORM public.notify_procurement_of_new_ticket(v_inquiry);

    RETURN NEXT v_inquiry;
END;
$$;

DROP FUNCTION IF EXISTS public.create_manual_inquiry(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT, DATE, DATE
);

NOTIFY pgrst, 'reload schema';
