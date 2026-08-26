-- Seed the container catalog (previously empty) and give Inquiry the
-- structured fields the sales team actually needs to capture: size,
-- condition, quantity and a needed-by date, instead of one freeform
-- requirements blob.

INSERT INTO public.container_categories (name) VALUES
    ('Dry'), ('High-Cube'), ('Double-Door'), ('Open-Top'), ('Flat-Rack'), ('Refrigerated')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.container_sizes (name) VALUES
    ('10ft'), ('20ft'), ('20ft HC'), ('40ft HC'), ('45ft HC'), ('53ft HC')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.container_conditions (name) VALUES
    ('Brand New'), ('One Trip'), ('Cargo Worthy'), ('WWT'), ('As-Is'), ('Refurbished'), ('Modified'), ('Used')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS container_size_id UUID REFERENCES public.container_sizes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS container_condition_id UUID REFERENCES public.container_conditions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS quantity INTEGER,
    ADD COLUMN IF NOT EXISTS needed_by_date DATE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inquiries_quantity_positive_check') THEN
        ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_quantity_positive_check
            CHECK (quantity IS NULL OR quantity > 0);
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.create_inquiry_from_warm_lead(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_inquiry_from_warm_lead(
    p_warm_lead_id UUID,
    p_actor_id UUID,
    p_container_size_id UUID,
    p_container_condition_id UUID,
    p_quantity INTEGER,
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
        container_size_id, container_condition_id, quantity, needed_by_date,
        requirements, status
    )
    VALUES (
        v_warm_lead.id, v_warm_lead.company_id, v_warm_lead.contact_id, v_warm_lead.pic_id,
        p_container_size_id, p_container_condition_id, p_quantity, p_needed_by_date,
        p_requirements, 'Under Review'
    )
    RETURNING * INTO v_inquiry;

    UPDATE public.warm_leads SET status = 'converted', converted_at = NOW() WHERE id = v_warm_lead.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));
    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
