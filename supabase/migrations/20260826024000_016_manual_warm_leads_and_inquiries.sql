-- Support manual Warm Lead and Inquiry creation, independent of a source Prospect/Warm
-- Lead, per the business rule that Prospect -> Warm Lead -> Inquiry is the common path but
-- not the only one (older contacts with a remembered interest but no on-file prospect
-- record; an existing customer with a fresh manual inquiry). Also adds the fields the sales
-- team needs to capture at each stage and a status filter for the Prospect Clients list.

ALTER TABLE public.warm_leads
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS previous_inquiry_indicator BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_date DATE,
    ADD COLUMN IF NOT EXISTS follow_up_notes TEXT,
    ADD COLUMN IF NOT EXISTS state_province TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS asking_price NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS special_requirements TEXT,
    ADD COLUMN IF NOT EXISTS remarks TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_date DATE,
    ADD COLUMN IF NOT EXISTS state_province TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.prospect_clients
    ADD COLUMN IF NOT EXISTS conversion_reason TEXT,
    ADD COLUMN IF NOT EXISTS conversion_channel TEXT;

-- Shared match-or-create used by manual Warm Lead / manual Inquiry creation. Reuses the same
-- normalized-identity matching as the import pipeline so a manually entered company/contact
-- lands on the same record as one already on file instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.find_or_create_company_contact(
    p_company_name TEXT,
    p_contact_person TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_state_province TEXT,
    p_country TEXT,
    OUT o_company_id UUID,
    OUT o_contact_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_norm TEXT := public.normalize_identity_text(p_company_name);
    v_phone_norm TEXT := public.normalize_phone(p_phone);
    v_email_norm TEXT := public.normalize_email(p_email);
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    IF v_company_norm IS NULL THEN
        RAISE EXCEPTION 'Company name is required' USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO o_company_id
    FROM public.companies
    WHERE name_normalized = v_company_norm
      AND public.normalize_identity_text(address_state) IS NOT DISTINCT FROM public.normalize_identity_text(p_state_province)
      AND public.normalize_identity_text(address_country) IS NOT DISTINCT FROM public.normalize_identity_text(p_country)
    LIMIT 1;

    IF o_company_id IS NULL THEN
        INSERT INTO public.companies (name, address_state, address_country)
        VALUES (btrim(p_company_name), NULLIF(btrim(p_state_province), ''), NULLIF(btrim(p_country), ''))
        RETURNING id INTO o_company_id;
    END IF;

    IF v_email_norm IS NOT NULL OR v_phone_norm IS NOT NULL THEN
        SELECT id INTO o_contact_id
        FROM public.contacts
        WHERE (v_email_norm IS NOT NULL AND v_email_norm IN (email_active_normalized, email_2_normalized))
           OR (v_phone_norm IS NOT NULL AND v_phone_norm IN (phone_direct_normalized, phone_2_normalized))
        LIMIT 1;
    END IF;

    IF o_contact_id IS NULL AND NULLIF(btrim(p_contact_person), '') IS NOT NULL THEN
        v_first_name := split_part(btrim(p_contact_person), ' ', 1);
        v_last_name := NULLIF(btrim(substr(btrim(p_contact_person), length(v_first_name) + 1)), '');
        INSERT INTO public.contacts (first_name, last_name, phone_direct, email_active)
        VALUES (v_first_name, v_last_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_email), ''))
        RETURNING id INTO o_contact_id;
    END IF;

    IF o_contact_id IS NOT NULL THEN
        INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
        VALUES (o_company_id, o_contact_id, true)
        ON CONFLICT (company_id, contact_id) DO NOTHING;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_warm_lead(
    p_actor_id UUID,
    p_company_name TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_pic_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_previous_inquiry_indicator BOOLEAN DEFAULT false,
    p_source TEXT DEFAULT NULL,
    p_follow_up_date DATE DEFAULT NULL,
    p_follow_up_notes TEXT DEFAULT NULL
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
    SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
    FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.warm_leads (
        source_prospect_id, company_id, contact_id, pic_id, status,
        notes, previous_inquiry_indicator, source, follow_up_date, follow_up_notes,
        state_province, country
    ) VALUES (
        NULL, v_company_id, v_contact_id, p_pic_id, 'active',
        NULLIF(btrim(p_notes), ''), COALESCE(p_previous_inquiry_indicator, false), NULLIF(btrim(p_source), ''),
        p_follow_up_date, NULLIF(btrim(p_follow_up_notes), ''),
        NULLIF(btrim(p_state_province), ''), NULLIF(btrim(p_country), '')
    )
    RETURNING * INTO v_warm_lead;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'warm_lead_created_manually', p_actor_id, jsonb_build_object('company_id', v_company_id, 'contact_id', v_contact_id));

    RETURN NEXT v_warm_lead;
END;
$$;

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
    p_needed_by_date DATE DEFAULT NULL
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
        -- Existing contact/customer -> manual inquiry with no Warm Lead in between.
        SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
        FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);
        v_pic_id := p_pic_id;
        v_state := NULLIF(btrim(p_state_province), '');
        v_country := NULLIF(btrim(p_country), '');
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
        v_state, v_country, 'Under Review'
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

    RETURN NEXT v_inquiry;
END;
$$;

-- convert_prospect_to_warm_lead gains optional reason/channel capture (e.g. "Replied to
-- email outreach"). The old 2-argument overload must be dropped first: leaving both would
-- give PostgREST two ambiguous candidates for the same RPC name when called with just the
-- original two arguments.
DROP FUNCTION IF EXISTS public.convert_prospect_to_warm_lead(UUID, UUID);

CREATE OR REPLACE FUNCTION public.convert_prospect_to_warm_lead(
    p_prospect_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_channel TEXT DEFAULT NULL
)
RETURNS SETOF public.warm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prospect public.prospect_clients%ROWTYPE;
    v_contact public.contacts%ROWTYPE;
    v_warm_lead public.warm_leads%ROWTYPE;
BEGIN
    SELECT * INTO v_prospect FROM public.prospect_clients WHERE id = p_prospect_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_warm_lead FROM public.warm_leads WHERE source_prospect_id = p_prospect_id;
    IF FOUND THEN RETURN NEXT v_warm_lead; RETURN; END IF;

    IF v_prospect.lifecycle_status <> 'active' OR v_prospect.category <> 'Proceed' THEN
        RAISE EXCEPTION 'Prospect is not eligible for conversion' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_contact FROM public.contacts WHERE id = v_prospect.contact_id;
    IF public.is_pipeline_identity_removed(v_prospect.company_id, v_prospect.contact_id, v_contact.email_active, v_contact.email_2, v_contact.phone_direct, v_contact.phone_2) THEN
        RAISE EXCEPTION 'Prospect is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.warm_leads (source_prospect_id, company_id, contact_id, pic_id, status)
    VALUES (v_prospect.id, v_prospect.company_id, v_prospect.contact_id, v_prospect.pic_id, 'active')
    RETURNING * INTO v_warm_lead;

    UPDATE public.prospect_clients
    SET lifecycle_status = 'converted', converted_at = NOW(),
        conversion_reason = NULLIF(btrim(p_reason), ''), conversion_channel = NULLIF(btrim(p_channel), '')
    WHERE id = v_prospect.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('prospect', v_prospect.id, 'converted_to_warm_lead', p_actor_id,
        jsonb_build_object('warm_lead_id', v_warm_lead.id, 'reason', p_reason, 'channel', p_channel));
    RETURN NEXT v_warm_lead;
END;
$$;

-- create_inquiry_from_warm_lead gains the same asking_price/special_requirements/remarks/
-- follow_up_date/state/country fields as the manual path, and inherits the warm lead's
-- state/country by default (per-inquiry values still override, since a delivery location
-- can differ from the company's registered address).
DROP FUNCTION IF EXISTS public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT);

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

    UPDATE public.warm_leads SET status = 'converted', converted_at = NOW() WHERE id = v_warm_lead.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));
    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_company_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_manual_warm_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_manual_inquiry(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_company_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_warm_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_inquiry(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, UUID, UUID, INTEGER, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
