-- Business-rule update from the sales team:
--
-- 1. Converting a Warm Lead to an Inquiry must NOT remove it from the Warm Leads working
--    list -- the warm lead's data stays visible there, and the new Inquiry also carries
--    that data. A Warm Lead may have multiple Inquiries over time (previously capped at one
--    per warm lead and marked 'converted', which hid it).
-- 2. Prospect Clients and Sales gain manual creation, matching Warm Leads/Inquiries.
-- 3. The shared removal/suppression system extends to Quotations (it already covers
--    Prospect/Warm Lead/Inquiry).

-- --- 1. Warm Lead stays visible; multiple Inquiries per Warm Lead ---------------------

CREATE OR REPLACE FUNCTION public.create_inquiry_from_warm_lead(
    p_warm_lead_id UUID,
    p_actor_id UUID,
    p_container_size_id UUID,
    p_container_condition_id UUID,
    p_quantity INTEGER,
    p_needed_by_date DATE DEFAULT NULL,
    p_requirements TEXT DEFAULT NULL,
    p_asking_price NUMERIC DEFAULT NULL,
    p_special_requirements TEXT DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL,
    p_follow_up_date DATE DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL
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
        asking_price, requirements, special_requirements, remarks, follow_up_date,
        state_province, country, status
    )
    VALUES (
        v_warm_lead.id, v_warm_lead.company_id, v_warm_lead.contact_id, v_warm_lead.pic_id,
        p_container_size_id, p_container_condition_id, p_quantity, p_needed_by_date,
        p_asking_price, p_requirements, NULLIF(btrim(p_special_requirements), ''),
        NULLIF(btrim(p_remarks), ''), p_follow_up_date,
        COALESCE(NULLIF(btrim(p_state_province), ''), v_warm_lead.state_province),
        COALESCE(NULLIF(btrim(p_country), ''), v_warm_lead.country),
        'Under Review'
    )
    RETURNING * INTO v_inquiry;

    -- Warm lead intentionally stays 'active' -- it remains visible in the Warm Leads list,
    -- and can generate further inquiries later. The link is preserved via
    -- inquiries.source_warm_lead_id; nothing about the warm lead record is hidden or lost.
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));
    RETURN NEXT v_inquiry;
END;
$$;

-- --- 2. Manual Prospect Client creation ------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_manual_prospect(
    p_actor_id UUID,
    p_company_name TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_pic_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT 'Proceed',
    p_sms_deliverability TEXT DEFAULT NULL,
    p_industry TEXT DEFAULT NULL,
    p_service_location TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_date_added TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.prospect_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_prospect public.prospect_clients%ROWTYPE;
    v_email_norm TEXT := public.normalize_email(p_email);
    v_phone_norm TEXT := public.normalize_phone(p_phone);
BEGIN
    IF p_category NOT IN ('Proceed', 'Removed') THEN
        RAISE EXCEPTION 'Category must be Proceed or Removed' USING ERRCODE = 'P0001';
    END IF;

    SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
    FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

    IF p_city IS NOT NULL AND NULLIF(btrim(p_city), '') IS NOT NULL THEN
        UPDATE public.companies SET address_city = btrim(p_city) WHERE id = v_company_id AND address_city IS NULL;
    END IF;
    IF p_industry IS NOT NULL AND NULLIF(btrim(p_industry), '') IS NOT NULL THEN
        UPDATE public.companies SET industry = btrim(p_industry) WHERE id = v_company_id AND industry IS NULL;
    END IF;

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.prospect_clients (
        company_id, contact_id, pic_id, category, lifecycle_status, source_data, created_at
    ) VALUES (
        v_company_id, v_contact_id, p_pic_id, p_category,
        CASE WHEN p_category = 'Removed' THEN 'removed' ELSE 'active' END,
        jsonb_build_object(
            'sms_deliverability', p_sms_deliverability,
            'service_locations', p_service_location,
            'manual_entry', true
        ),
        COALESCE(p_date_added, NOW())
    )
    RETURNING * INTO v_prospect;

    IF p_category = 'Removed' THEN
        IF v_email_norm IS NOT NULL THEN
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'email', v_email_norm, 'Marked Removed on manual entry', 'manual', p_actor_id)
            ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
        ELSIF v_phone_norm IS NOT NULL THEN
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'phone', v_phone_norm, 'Marked Removed on manual entry', 'manual', p_actor_id)
            ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
        ELSE
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'contact', 'Marked Removed on manual entry', 'manual', p_actor_id);
        END IF;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('prospect', v_prospect.id, 'prospect_created_manually', p_actor_id, jsonb_build_object('company_id', v_company_id, 'contact_id', v_contact_id));

    RETURN NEXT v_prospect;
END;
$$;

-- --- 3. Manual Sale creation (Sales Tracker can be a direct entry, not only via Quotation) --

CREATE OR REPLACE FUNCTION public.create_manual_sale(
    p_actor_id UUID,
    p_company_name TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_pic_id UUID DEFAULT NULL,
    p_total_units INTEGER DEFAULT NULL,
    p_buying_cost NUMERIC DEFAULT NULL,
    p_revenue NUMERIC DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL
)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_sale public.sales%ROWTYPE;
    v_profit NUMERIC(12,2);
BEGIN
    IF p_total_units IS NULL OR p_total_units < 1 OR p_buying_cost IS NULL OR p_buying_cost < 0 OR p_revenue IS NULL OR p_revenue < 0 THEN
        RAISE EXCEPTION 'Sale values are invalid' USING ERRCODE = 'P0001';
    END IF;

    SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
    FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    v_profit := p_revenue - p_buying_cost;

    INSERT INTO public.sales (quotation_id, company_id, pic_id, status, total_units, buying_cost, revenue, gross_profit)
    VALUES (NULL, v_company_id, p_pic_id, 'Won', p_total_units, p_buying_cost, p_revenue, v_profit)
    RETURNING * INTO v_sale;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('sale', v_sale.id, 'sale_created_manually', p_actor_id, jsonb_build_object('company_id', v_company_id, 'gross_profit', v_profit));

    RETURN NEXT v_sale;
END;
$$;

-- --- 4. Extend the shared removal system to Quotations ---------------------------------

CREATE OR REPLACE FUNCTION public.remove_pipeline_entry(
    p_stage TEXT,
    p_entity_id UUID,
    p_actor_id UUID,
    p_reason TEXT
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

    INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
    VALUES (v_company_id, v_contact_id, 'contact', btrim(p_reason), p_stage, p_actor_id)
    RETURNING * INTO v_removed;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (p_stage, p_entity_id, 'removed', p_actor_id, jsonb_build_object('reason', btrim(p_reason), 'removed_entry_id', v_removed.id));
    RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_manual_prospect(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_manual_sale(UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_prospect(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_sale(UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
