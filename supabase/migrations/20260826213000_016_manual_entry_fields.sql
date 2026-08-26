-- Add new fields to inquiries
ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS asking_price NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS state_province TEXT;

DROP FUNCTION IF EXISTS public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.create_inquiry_from_warm_lead(
    p_warm_lead_id UUID,
    p_actor_id UUID,
    p_container_size_id UUID,
    p_container_condition_id UUID,
    p_quantity INTEGER,
    p_asking_price NUMERIC(10, 2) DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_needed_by_date DATE DEFAULT NULL,
    p_requirements TEXT DEFAULT NULL
)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_warm_lead public.warm_leads%ROWTYPE;
    v_contact public.contacts%ROWTYPE;
    v_inquiry public.inquiries%ROWTYPE;
BEGIN
    SELECT * INTO v_warm_lead FROM public.warm_leads WHERE id = p_warm_lead_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_inquiry FROM public.inquiries WHERE source_warm_lead_id = p_warm_lead_id;
    IF FOUND THEN RETURN NEXT v_inquiry; RETURN; END IF;

    IF v_warm_lead.status <> 'active' THEN
        RAISE EXCEPTION 'Warm lead is not eligible for an inquiry' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_contact FROM public.contacts WHERE id = v_warm_lead.contact_id;
    IF public.is_pipeline_identity_removed(v_warm_lead.company_id, v_warm_lead.contact_id, v_contact.email_active, v_contact.email_2, v_contact.phone_direct, v_contact.phone_2) THEN
        RAISE EXCEPTION 'Warm lead is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.container_sizes WHERE id = p_container_size_id) THEN
        RAISE EXCEPTION 'Unknown container size' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.container_conditions WHERE id = p_container_condition_id) THEN
        RAISE EXCEPTION 'Unknown container condition' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.inquiries (
        source_warm_lead_id, company_id, contact_id, pic_id,
        container_size_id, container_condition_id, quantity, asking_price, state_province, needed_by_date,
        requirements, status
    )
    VALUES (
        v_warm_lead.id, v_warm_lead.company_id, v_warm_lead.contact_id, v_warm_lead.pic_id,
        p_container_size_id, p_container_condition_id, p_quantity, p_asking_price, p_state_province, p_needed_by_date,
        p_requirements, 'Under Review'
    )
    RETURNING * INTO v_inquiry;

    UPDATE public.warm_leads SET status = 'converted', converted_at = NOW() WHERE id = v_warm_lead.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));
    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, DATE, TEXT) TO service_role;


-- Manual creation of a Warm Lead
CREATE OR REPLACE FUNCTION public.manual_create_warm_lead(
    p_company_name TEXT,
    p_contact_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_actor_id UUID
)
RETURNS SETOF public.warm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_warm_lead public.warm_leads%ROWTYPE;
BEGIN
    -- 1. Resolve Company
    IF p_company_name IS NOT NULL AND trim(p_company_name) <> '' THEN
        SELECT id INTO v_company_id FROM public.companies WHERE normalize_company_name(name) = normalize_company_name(p_company_name) LIMIT 1;
        IF v_company_id IS NULL THEN
            INSERT INTO public.companies (name) VALUES (trim(p_company_name)) RETURNING id INTO v_company_id;
        END IF;
    END IF;

    -- 2. Resolve Contact
    IF p_contact_name IS NOT NULL AND trim(p_contact_name) <> '' THEN
        -- Basic deduplication by email/phone
        IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
            SELECT id INTO v_contact_id FROM public.contacts WHERE email_active = trim(p_email) LIMIT 1;
        END IF;
        IF v_contact_id IS NULL AND p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
            SELECT id INTO v_contact_id FROM public.contacts WHERE phone_direct = trim(p_phone) LIMIT 1;
        END IF;
        
        IF v_contact_id IS NULL THEN
            INSERT INTO public.contacts (first_name, company_id, email_active, phone_direct) 
            VALUES (trim(p_contact_name), v_company_id, trim(COALESCE(p_email, '')), trim(COALESCE(p_phone, ''))) 
            RETURNING id INTO v_contact_id;
        END IF;
    END IF;

    -- 3. Insert Warm Lead
    INSERT INTO public.warm_leads (company_id, contact_id, pic_id, status)
    VALUES (v_company_id, v_contact_id, p_actor_id, 'active')
    RETURNING * INTO v_warm_lead;

    -- 4. Log Event
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'manual_created', p_actor_id, jsonb_build_object('company_name', p_company_name));

    RETURN NEXT v_warm_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_create_warm_lead(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_create_warm_lead(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;


-- Manual creation of an Inquiry
CREATE OR REPLACE FUNCTION public.manual_create_inquiry(
    p_company_name TEXT,
    p_contact_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_container_size_id UUID,
    p_container_condition_id UUID,
    p_quantity INTEGER,
    p_asking_price NUMERIC(10, 2),
    p_state_province TEXT,
    p_needed_by_date DATE,
    p_requirements TEXT,
    p_actor_id UUID
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
    -- 1. First manually create the Warm Lead
    SELECT * INTO v_warm_lead FROM public.manual_create_warm_lead(p_company_name, p_contact_name, p_email, p_phone, p_actor_id);

    -- 2. Then invoke the standard Inquiry creation
    SELECT * INTO v_inquiry FROM public.create_inquiry_from_warm_lead(
        v_warm_lead.id,
        p_actor_id,
        p_container_size_id,
        p_container_condition_id,
        p_quantity,
        p_asking_price,
        p_state_province,
        p_needed_by_date,
        p_requirements
    );

    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_create_inquiry(TEXT, TEXT, TEXT, TEXT, UUID, UUID, INTEGER, NUMERIC, TEXT, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_create_inquiry(TEXT, TEXT, TEXT, TEXT, UUID, UUID, INTEGER, NUMERIC, TEXT, DATE, TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
