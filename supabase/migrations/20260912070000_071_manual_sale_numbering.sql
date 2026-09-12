-- The manual sale form now carries the client's own sale number, their invoice number and
-- the container type, so create_manual_sale takes them. A blank sale number still falls to
-- the trigger, which allocates the next WAVE number; a supplied one is checked for shape
-- and for being unused, so the field is editable without breaking the series.
--
-- The status is a parameter as well, since a sale can be entered as Pending or recorded as
-- Cancelled, not only Won.
--
-- Adding parameters creates an overload rather than replacing the function, so the previous
-- signature is dropped at the end -- the fault that made recording a sale answer 500 in 067.

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
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_container_size_id UUID DEFAULT NULL,
    p_container_condition_id UUID DEFAULT NULL,
    p_sale_date DATE DEFAULT NULL,
    p_sale_number TEXT DEFAULT NULL,
    p_invoice_number TEXT DEFAULT NULL,
    p_container_category_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'Won'
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
    IF p_sale_date IS NOT NULL AND p_sale_date > (NOW() AT TIME ZONE 'UTC')::DATE + 1 THEN
        RAISE EXCEPTION 'A sale cannot be dated in the future' USING ERRCODE = 'P0001';
    END IF;
    IF p_status NOT IN ('Pending', 'Won', 'Cancelled') THEN
        RAISE EXCEPTION 'Status must be Pending, Won or Cancelled' USING ERRCODE = 'P0001';
    END IF;
    -- A supplied sale number has to look like one of theirs; a blank one is allocated by
    -- the trigger, which is what keeps the field editable without losing the series.
    IF NULLIF(btrim(p_sale_number), '') IS NOT NULL AND btrim(p_sale_number) !~ '^WAVE-[0-9]{3,10}$' THEN
        RAISE EXCEPTION 'Sale number must look like WAVE-10317' USING ERRCODE = 'P0001';
    END IF;
    IF NULLIF(btrim(p_sale_number), '') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.sales WHERE upper(btrim(sale_number)) = upper(btrim(p_sale_number))) THEN
        RAISE EXCEPTION 'Sale number % is already used', btrim(p_sale_number) USING ERRCODE = 'P0001';
    END IF;

    SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
    FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

    -- find_or_create_company_contact does not take a city, so fill it in when the company
    -- does not have one yet rather than overwriting what is on record.
    IF NULLIF(btrim(p_city), '') IS NOT NULL THEN
        UPDATE public.companies SET address_city = btrim(p_city)
        WHERE id = v_company_id AND (address_city IS NULL OR btrim(address_city) = '');
    END IF;

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    v_profit := p_revenue - p_buying_cost;

    INSERT INTO public.sales (
        quotation_id, company_id, pic_id, status, total_units, buying_cost, revenue, gross_profit,
        container_size_id, container_condition_id, container_category_id, sale_date,
        sale_number, invoice_number, created_at
    )
    VALUES (
        NULL, v_company_id, p_pic_id, p_status, p_total_units, p_buying_cost, p_revenue, v_profit,
        p_container_size_id, p_container_condition_id, p_container_category_id, p_sale_date,
        NULLIF(btrim(p_sale_number), ''), NULLIF(btrim(p_invoice_number), ''),
        -- Dating the sale earlier dates the record too, so it lands in the right month on
        -- every report that groups by created_at.
        COALESCE(p_sale_date::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_sale;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('sale', v_sale.id, 'sale_created_manually', p_actor_id, jsonb_build_object('company_id', v_company_id, 'gross_profit', v_profit));

    RETURN NEXT v_sale;
END;
$$;



DROP FUNCTION IF EXISTS public.create_manual_sale(
    UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE
);

NOTIFY pgrst, 'reload schema';
