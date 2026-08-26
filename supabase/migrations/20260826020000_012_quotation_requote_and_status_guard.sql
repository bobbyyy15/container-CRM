-- Fix two correctness gaps in the quotation lifecycle:
--   1. An inquiry could never be re-quoted after its quotation was Rejected,
--      because the unique index and idempotency lookup matched ANY prior
--      quotation regardless of status.
--   2. PATCH /deals/quotations/:id/status accepted 'Converted' as a manual
--      target and bypassed convert_quotation_to_sale entirely, letting a
--      quotation vanish from the active list with no corresponding sale.

DROP INDEX IF EXISTS public.quotations_inquiry_unique_idx;

-- Only one non-rejected quotation may exist per inquiry at a time; a
-- rejected quotation no longer blocks requoting.
CREATE UNIQUE INDEX quotations_inquiry_active_unique_idx
    ON public.quotations (inquiry_id)
    WHERE inquiry_id IS NOT NULL AND status <> 'Rejected';

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

    IF v_inquiry.status IN ('Removed', 'Lost', 'Converted to Sale') THEN
        RAISE EXCEPTION 'Inquiry is not eligible for quotation' USING ERRCODE = 'P0001';
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

-- Transactional, guarded status transition. 'Converted' is intentionally
-- excluded: that terminal state is only ever set by convert_quotation_to_sale.
CREATE OR REPLACE FUNCTION public.update_quotation_status(
    p_quotation_id UUID,
    p_actor_id UUID,
    p_status TEXT
)
RETURNS SETOF public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quotation public.quotations%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Sent', 'Viewed', 'Accepted', 'Rejected') THEN
        RAISE EXCEPTION 'Unsupported quotation status' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_quotation.status = 'Converted' THEN
        RAISE EXCEPTION 'Converted quotations cannot be modified' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.quotations
    SET status = p_status
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    IF p_status = 'Rejected' AND v_quotation.inquiry_id IS NOT NULL THEN
        UPDATE public.inquiries
        SET status = 'Quotation Rejected'
        WHERE id = v_quotation.inquiry_id;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (
        'quotation', v_quotation.id, lower('quotation_' || p_status), p_actor_id,
        jsonb_build_object('status', p_status)
    );

    RETURN NEXT v_quotation;
END;
$$;

REVOKE ALL ON FUNCTION public.update_quotation_status(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_quotation_status(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
