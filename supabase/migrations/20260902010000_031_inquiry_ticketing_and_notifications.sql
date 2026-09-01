-- 031_inquiry_ticketing_and_notifications.sql
--
-- Turns Inquiries into a real ticketing workflow: a Sales Manager's inquiry no longer goes
-- straight to "Under Review" (quotable) -- it starts as 'Pending Validation' and must be
-- approved or rejected by Procurement before it can be quoted. Rejection requires a reason
-- and can carry an alternative suggestion in the same ticket. Both outcomes notify the
-- Sales Manager who owns the ticket (via their PIC identity); ticket creation notifies every
-- Procurement user. Also adds the 4th role, 'operations', to the role model.

-- --- 0. Fourth role: operations ---------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'sales_manager', 'procurement', 'operations'));

-- --- 1. In-app notifications -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    entity_type TEXT,
    entity_id UUID,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_profile_id_created_at_idx
    ON public.notifications (profile_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their own notifications" ON public.notifications;
CREATE POLICY "Users see their own notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can mark their own notifications read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications read" ON public.notifications
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid());

-- --- 2. Inquiry ticket columns ------------------------------------------------------------

ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alternative_offer TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

ALTER TABLE public.inquiries ALTER COLUMN status SET DEFAULT 'Pending Validation';

-- --- 3. Notify every Procurement user when a ticket needs validation ---------------------

CREATE OR REPLACE FUNCTION public.notify_procurement_of_new_ticket(p_inquiry public.inquiries)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ref TEXT := 'INQ-' || upper(left(p_inquiry.id::text, 8));
BEGIN
    INSERT INTO public.notifications (profile_id, type, title, message, entity_type, entity_id)
    SELECT id, 'inquiry_pending_validation', 'New inquiry ticket needs validation',
           v_ref || ' is waiting for review.', 'inquiry', p_inquiry.id
    FROM public.profiles
    WHERE role = 'procurement' AND status = 'active';
END;
$$;

-- --- 4. Ticket creation now starts at 'Pending Validation' -------------------------------

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
        'Pending Validation'
    )
    RETURNING * INTO v_inquiry;

    -- Warm lead intentionally stays 'active' -- it remains visible in the Warm Leads list,
    -- and can generate further inquiries later. The link is preserved via
    -- inquiries.source_warm_lead_id; nothing about the warm lead record is hidden or lost.
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));

    PERFORM public.notify_procurement_of_new_ticket(v_inquiry);

    RETURN NEXT v_inquiry;
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

-- --- 5. Procurement validates (approve/reject) a ticket -----------------------------------

CREATE OR REPLACE FUNCTION public.validate_inquiry_ticket(
    p_inquiry_id UUID,
    p_actor_id UUID,
    p_approved BOOLEAN,
    p_rejection_reason TEXT DEFAULT NULL,
    p_alternative_offer TEXT DEFAULT NULL
)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_inquiry public.inquiries%ROWTYPE;
    v_owner_profile_id UUID;
    v_ref TEXT;
BEGIN
    SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002'; END IF;
    IF v_inquiry.status <> 'Pending Validation' THEN
        RAISE EXCEPTION 'This inquiry ticket is not awaiting validation' USING ERRCODE = 'P0001';
    END IF;
    IF NOT p_approved AND NULLIF(btrim(p_rejection_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required to reject an inquiry ticket' USING ERRCODE = 'P0001';
    END IF;

    v_ref := 'INQ-' || upper(left(v_inquiry.id::text, 8));

    -- 'Validation Rejected' (not bare 'Rejected') so this never collides in meaning with
    -- quotations.status = 'Rejected' / inquiries.status = 'Quotation Rejected', which are a
    -- separate, later stage of the same inquiry's lifecycle.
    UPDATE public.inquiries SET
        status = CASE WHEN p_approved THEN 'Under Review' ELSE 'Validation Rejected' END,
        rejection_reason = CASE WHEN p_approved THEN NULL ELSE btrim(p_rejection_reason) END,
        alternative_offer = NULLIF(btrim(p_alternative_offer), ''),
        validated_by = p_actor_id,
        validated_at = NOW()
    WHERE id = p_inquiry_id
    RETURNING * INTO v_inquiry;

    SELECT profile_id INTO v_owner_profile_id FROM public.pics WHERE id = v_inquiry.pic_id;
    IF v_owner_profile_id IS NOT NULL THEN
        INSERT INTO public.notifications (profile_id, type, title, message, entity_type, entity_id)
        VALUES (
            v_owner_profile_id,
            CASE WHEN p_approved THEN 'inquiry_approved' ELSE 'inquiry_rejected' END,
            CASE WHEN p_approved THEN 'Inquiry ticket approved' ELSE 'Inquiry ticket rejected' END,
            CASE WHEN p_approved
                THEN v_ref || ' was approved by Procurement and is now ready to quote.'
                ELSE v_ref || ' was rejected: ' || v_inquiry.rejection_reason ||
                     CASE WHEN v_inquiry.alternative_offer IS NOT NULL THEN E'\nAlternative suggested: ' || v_inquiry.alternative_offer ELSE '' END
            END,
            'inquiry', v_inquiry.id
        );
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('inquiry', v_inquiry.id, CASE WHEN p_approved THEN 'ticket_approved' ELSE 'ticket_rejected' END, p_actor_id,
            jsonb_build_object('reason', v_inquiry.rejection_reason, 'alternative', v_inquiry.alternative_offer));

    RETURN NEXT v_inquiry;
END;
$$;

-- --- 6. A ticket must be validated (approved) before it can be quoted --------------------

CREATE OR REPLACE FUNCTION public.create_quotation_from_inquiry(
    p_inquiry_id UUID,
    p_items JSONB,
    p_actor_id UUID,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS SETOF public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inquiry public.inquiries%ROWTYPE;
    v_quotation public.quotations%ROWTYPE;
    v_total NUMERIC(12,2);
BEGIN
    SELECT * INTO v_inquiry
    FROM public.inquiries
    WHERE id = p_inquiry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE inquiry_id = p_inquiry_id AND status <> 'Rejected';

    IF FOUND THEN
        RETURN NEXT v_quotation;
        RETURN;
    END IF;

    IF v_inquiry.status IN ('Removed', 'Lost', 'Converted to Sale', 'Pending Validation', 'Validation Rejected') THEN
        RAISE EXCEPTION 'Inquiry ticket must be approved by Procurement before it can be quoted' USING ERRCODE = 'P0001';
    END IF;

    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one quotation item is required';
    END IF;

    SELECT COALESCE(sum(item.quantity * item.unit_price), 0)
    INTO v_total
    FROM jsonb_to_recordset(p_items) AS item(description TEXT, quantity INTEGER, unit_price NUMERIC);

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_items) AS item(description TEXT, quantity INTEGER, unit_price NUMERIC)
        WHERE NULLIF(btrim(item.description), '') IS NULL OR item.quantity < 1 OR item.unit_price < 0
    ) THEN
        RAISE EXCEPTION 'Quotation items contain invalid values';
    END IF;

    INSERT INTO public.quotations (
        inquiry_id, company_id, contact_id, pic_id, status,
        total_amount, valid_until, notes
    ) VALUES (
        v_inquiry.id, v_inquiry.company_id, v_inquiry.contact_id, v_inquiry.pic_id, 'Draft',
        v_total, p_valid_until, NULLIF(btrim(p_notes), '')
    )
    RETURNING * INTO v_quotation;

    INSERT INTO public.quotation_items (quotation_id, description, quantity, unit_price, total_price)
    SELECT v_quotation.id, btrim(item.description), item.quantity, item.unit_price,
           item.quantity * item.unit_price
    FROM jsonb_to_recordset(p_items) AS item(description TEXT, quantity INTEGER, unit_price NUMERIC);

    UPDATE public.inquiries
    SET status = 'Quotation Created'
    WHERE id = v_inquiry.id;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (
        'inquiry', v_inquiry.id, 'quotation_created', p_actor_id,
        jsonb_build_object('quotation_id', v_quotation.id, 'total_amount', v_total)
    );

    RETURN NEXT v_quotation;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_procurement_of_new_ticket(public.inquiries) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_inquiry_ticket(UUID, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_procurement_of_new_ticket(public.inquiries) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_inquiry_ticket(UUID, UUID, BOOLEAN, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
