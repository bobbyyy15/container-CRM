-- Transactional and idempotent Inquiry -> Quotation -> Sale transitions.

CREATE UNIQUE INDEX IF NOT EXISTS quotations_inquiry_unique_idx
    ON public.quotations (inquiry_id)
    WHERE inquiry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_quotation_unique_idx
    ON public.sales (quotation_id)
    WHERE quotation_id IS NOT NULL;

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
    WHERE inquiry_id = p_inquiry_id;

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

CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale(
    p_quotation_id UUID,
    p_actor_id UUID,
    p_total_units INTEGER,
    p_buying_cost NUMERIC,
    p_revenue NUMERIC
)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quotation public.quotations%ROWTYPE;
    v_sale public.sales%ROWTYPE;
    v_profit NUMERIC(12,2);
BEGIN
    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_sale
    FROM public.sales
    WHERE quotation_id = p_quotation_id;

    IF FOUND THEN
        RETURN NEXT v_sale;
        RETURN;
    END IF;

    IF v_quotation.status <> 'Accepted' THEN
        RAISE EXCEPTION 'Quotation must be Accepted before recording a sale' USING ERRCODE = 'P0001';
    END IF;
    IF p_total_units < 1 OR p_buying_cost < 0 OR p_revenue < 0 THEN
        RAISE EXCEPTION 'Sale values are invalid';
    END IF;

    v_profit := p_revenue - p_buying_cost;

    INSERT INTO public.sales (
        quotation_id, company_id, pic_id, status, total_units,
        buying_cost, revenue, gross_profit
    ) VALUES (
        v_quotation.id, v_quotation.company_id, v_quotation.pic_id, 'Won', p_total_units,
        p_buying_cost, p_revenue, v_profit
    )
    RETURNING * INTO v_sale;

    UPDATE public.quotations SET status = 'Converted' WHERE id = v_quotation.id;
    UPDATE public.inquiries SET status = 'Converted to Sale' WHERE id = v_quotation.inquiry_id;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (
        'quotation', v_quotation.id, 'sale_won', p_actor_id,
        jsonb_build_object('sale_id', v_sale.id, 'gross_profit', v_profit)
    );

    RETURN NEXT v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quotation_from_inquiry(UUID, JSONB, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_quotation_to_sale(UUID, UUID, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_from_inquiry(UUID, JSONB, UUID, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale(UUID, UUID, INTEGER, NUMERIC, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
