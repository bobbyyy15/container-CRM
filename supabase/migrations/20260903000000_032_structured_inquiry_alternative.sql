-- 032_structured_inquiry_alternative.sql
--
-- Replaces the free-text alternative_offer with structured fields Procurement can pick from
-- the same dropdowns used everywhere else (size, condition, quantity, price), plus a notes
-- field for context that doesn't fit a dropdown. This lets the Sales Manager act on it with
-- one click (apply_inquiry_alternative) instead of re-typing a whole new ticket -- the
-- alternative becomes the ticket's own spec and the ticket goes straight back to quotable,
-- since Procurement already vetted this specific version of it.

ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alt_container_size_id UUID REFERENCES public.container_sizes(id);
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alt_container_condition_id UUID REFERENCES public.container_conditions(id);
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alt_quantity INTEGER;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alt_asking_price NUMERIC(12,2);
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS alt_notes TEXT;

-- One-time carry-forward: any ticket already rejected under 029/030/031 with the old
-- free-text alternative_offer keeps it visible via alt_notes instead of silently vanishing.
UPDATE public.inquiries
SET alt_notes = alternative_offer
WHERE alternative_offer IS NOT NULL AND alt_notes IS NULL;

CREATE OR REPLACE FUNCTION public.validate_inquiry_ticket(
    p_inquiry_id UUID,
    p_actor_id UUID,
    p_approved BOOLEAN,
    p_rejection_reason TEXT DEFAULT NULL,
    p_alt_container_size_id UUID DEFAULT NULL,
    p_alt_container_condition_id UUID DEFAULT NULL,
    p_alt_quantity INTEGER DEFAULT NULL,
    p_alt_asking_price NUMERIC DEFAULT NULL,
    p_alt_notes TEXT DEFAULT NULL
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
    v_alt_size TEXT;
    v_alt_condition TEXT;
    v_has_alt BOOLEAN;
    v_alt_summary TEXT;
BEGIN
    SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002'; END IF;
    IF v_inquiry.status <> 'Pending Validation' THEN
        RAISE EXCEPTION 'This inquiry ticket is not awaiting validation' USING ERRCODE = 'P0001';
    END IF;
    IF NOT p_approved AND NULLIF(btrim(p_rejection_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required to reject an inquiry ticket' USING ERRCODE = 'P0001';
    END IF;
    IF p_alt_container_size_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.container_sizes WHERE id = p_alt_container_size_id) THEN
        RAISE EXCEPTION 'Unknown alternative container size' USING ERRCODE = 'P0001';
    END IF;
    IF p_alt_container_condition_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.container_conditions WHERE id = p_alt_container_condition_id) THEN
        RAISE EXCEPTION 'Unknown alternative container condition' USING ERRCODE = 'P0001';
    END IF;

    v_ref := 'INQ-' || upper(left(v_inquiry.id::text, 8));
    v_has_alt := NOT p_approved AND (
        p_alt_container_size_id IS NOT NULL OR p_alt_container_condition_id IS NOT NULL
        OR p_alt_quantity IS NOT NULL OR p_alt_asking_price IS NOT NULL OR NULLIF(btrim(p_alt_notes), '') IS NOT NULL
    );

    -- 'Validation Rejected' (not bare 'Rejected') so this never collides in meaning with
    -- quotations.status = 'Rejected' / inquiries.status = 'Quotation Rejected', which are a
    -- separate, later stage of the same inquiry's lifecycle.
    UPDATE public.inquiries SET
        status = CASE WHEN p_approved THEN 'Under Review' ELSE 'Validation Rejected' END,
        rejection_reason = CASE WHEN p_approved THEN NULL ELSE btrim(p_rejection_reason) END,
        alt_container_size_id = CASE WHEN v_has_alt THEN p_alt_container_size_id ELSE NULL END,
        alt_container_condition_id = CASE WHEN v_has_alt THEN p_alt_container_condition_id ELSE NULL END,
        alt_quantity = CASE WHEN v_has_alt THEN p_alt_quantity ELSE NULL END,
        alt_asking_price = CASE WHEN v_has_alt THEN p_alt_asking_price ELSE NULL END,
        alt_notes = CASE WHEN v_has_alt THEN NULLIF(btrim(p_alt_notes), '') ELSE NULL END,
        validated_by = p_actor_id,
        validated_at = NOW()
    WHERE id = p_inquiry_id
    RETURNING * INTO v_inquiry;

    IF v_inquiry.alt_container_size_id IS NOT NULL THEN
        SELECT name INTO v_alt_size FROM public.container_sizes WHERE id = v_inquiry.alt_container_size_id;
    END IF;
    IF v_inquiry.alt_container_condition_id IS NOT NULL THEN
        SELECT name INTO v_alt_condition FROM public.container_conditions WHERE id = v_inquiry.alt_container_condition_id;
    END IF;
    v_alt_summary := NULLIF(btrim(concat_ws(', ',
        CASE WHEN v_alt_size IS NOT NULL THEN v_alt_size END,
        CASE WHEN v_alt_condition IS NOT NULL THEN v_alt_condition END,
        CASE WHEN v_inquiry.alt_quantity IS NOT NULL THEN v_inquiry.alt_quantity || ' units' END,
        CASE WHEN v_inquiry.alt_asking_price IS NOT NULL THEN '$' || v_inquiry.alt_asking_price END
    )), '');

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
                     CASE WHEN v_alt_summary IS NOT NULL THEN E'\nAlternative suggested: ' || v_alt_summary ||
                          CASE WHEN v_inquiry.alt_notes IS NOT NULL THEN ' -- ' || v_inquiry.alt_notes ELSE '' END
                     ELSE '' END
            END,
            'inquiry', v_inquiry.id
        );
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('inquiry', v_inquiry.id, CASE WHEN p_approved THEN 'ticket_approved' ELSE 'ticket_rejected' END, p_actor_id,
            jsonb_build_object('reason', v_inquiry.rejection_reason, 'alt_summary', v_alt_summary, 'alt_notes', v_inquiry.alt_notes));

    RETURN NEXT v_inquiry;
END;
$$;

-- Sales Manager accepts Procurement's suggested alternative in place: the ticket's own spec
-- becomes the alternative, and it goes straight back to 'Under Review' (quotable) without a
-- second trip through validation, since Procurement already vetted this exact version.
CREATE OR REPLACE FUNCTION public.apply_inquiry_alternative(
    p_inquiry_id UUID,
    p_actor_id UUID
)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inquiry public.inquiries%ROWTYPE;
BEGIN
    SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002'; END IF;
    IF v_inquiry.status <> 'Validation Rejected' THEN
        RAISE EXCEPTION 'This ticket has no pending alternative to apply' USING ERRCODE = 'P0001';
    END IF;
    IF v_inquiry.alt_container_size_id IS NULL AND v_inquiry.alt_container_condition_id IS NULL
       AND v_inquiry.alt_quantity IS NULL AND v_inquiry.alt_asking_price IS NULL THEN
        RAISE EXCEPTION 'Procurement did not offer a structured alternative on this ticket' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.inquiries SET
        status = 'Under Review',
        container_size_id = COALESCE(alt_container_size_id, container_size_id),
        container_condition_id = COALESCE(alt_container_condition_id, container_condition_id),
        quantity = COALESCE(alt_quantity, quantity),
        asking_price = COALESCE(alt_asking_price, asking_price),
        alt_container_size_id = NULL,
        alt_container_condition_id = NULL,
        alt_quantity = NULL,
        alt_asking_price = NULL,
        rejection_reason = NULL
    WHERE id = p_inquiry_id
    RETURNING * INTO v_inquiry;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('inquiry', v_inquiry.id, 'alternative_applied', p_actor_id, '{}'::jsonb);

    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inquiry_ticket(UUID, UUID, BOOLEAN, TEXT, UUID, UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_inquiry_alternative(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_inquiry_ticket(UUID, UUID, BOOLEAN, TEXT, UUID, UUID, INTEGER, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_inquiry_alternative(UUID, UUID) TO service_role;

-- The old 5-arg validate_inquiry_ticket(uuid, uuid, boolean, text, text) is superseded --
-- drop it so PostgREST doesn't have two overloads with an ambiguous 4-text-arg call shape.
DROP FUNCTION IF EXISTS public.validate_inquiry_ticket(UUID, UUID, BOOLEAN, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
