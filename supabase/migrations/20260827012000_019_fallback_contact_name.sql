-- find_or_create_company_contact only created a new contact when a name was given, leaving
-- o_contact_id NULL whenever a caller supplied just an email/phone with no name. That's fine
-- for Prospects (contact_id is nullable there), but warm_leads.contact_id is NOT NULL, so
-- create_manual_warm_lead failed outright on "company + email only, no name yet" -- exactly
-- the kind of partial information manual entry is supposed to accept.
--
-- Fix: when no name is given but an email or phone is, fall back to a name derived from
-- whichever identifier is available (matching the same fallback pattern handle_new_user
-- already uses for usernames), so a contact always gets created whenever there's ANY
-- identifying information. Only truly empty input (no name, no email, no phone) still
-- leaves the contact unset -- appropriate for a company-only Prospect.

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
    v_contact_person TEXT;
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

    IF o_contact_id IS NULL THEN
        v_contact_person := NULLIF(btrim(p_contact_person), '');
        IF v_contact_person IS NULL AND (v_email_norm IS NOT NULL OR v_phone_norm IS NOT NULL) THEN
            v_contact_person := COALESCE(NULLIF(split_part(p_email, '@', 1), ''), p_phone);
        END IF;

        IF v_contact_person IS NOT NULL THEN
            v_first_name := split_part(v_contact_person, ' ', 1);
            v_last_name := NULLIF(btrim(substr(v_contact_person, length(v_first_name) + 1)), '');
            INSERT INTO public.contacts (first_name, last_name, phone_direct, email_active)
            VALUES (v_first_name, v_last_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_email), ''))
            RETURNING id INTO o_contact_id;
        END IF;
    END IF;

    IF o_contact_id IS NOT NULL THEN
        INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
        VALUES (o_company_id, o_contact_id, true)
        ON CONFLICT (company_id, contact_id) DO NOTHING;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_company_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_company_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Even with the fallback above, a warm lead with truly nothing identifying beyond a company
-- name (no name, no email, no phone) still can't satisfy warm_leads.contact_id NOT NULL --
-- give that a clear error instead of a raw constraint-violation message.
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

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'A contact person, email, or phone is required for a warm lead' USING ERRCODE = 'P0001';
    END IF;

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

REVOKE ALL ON FUNCTION public.create_manual_warm_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_warm_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, DATE, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
