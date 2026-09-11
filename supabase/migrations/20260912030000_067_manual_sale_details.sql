-- A manually recorded sale had nowhere to put what was actually sold. Sales Tracker has
-- Size and Condition columns, and for a manual sale they were literally the string "—":
-- the columns did not exist. The city never reached the company record either, and the
-- sale was always dated the moment it was typed in, which is wrong for a sale being
-- entered after the fact.
--
-- Size and condition live on the inquiry for a quotation-based sale, so they are recorded
-- on the sale itself only when there is no quotation to read them from; the sales list
-- prefers the sale's own values and falls back to the inquiry behind the quotation.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS container_size_id UUID REFERENCES public.container_sizes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS container_condition_id UUID REFERENCES public.container_conditions(id) ON DELETE SET NULL,
  -- When the sale happened, as opposed to when the row was created.
  ADD COLUMN IF NOT EXISTS sale_date DATE;

CREATE INDEX IF NOT EXISTS idx_sales_container_size ON public.sales(container_size_id) WHERE container_size_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_container_condition ON public.sales(container_condition_id) WHERE container_condition_id IS NOT NULL;

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
    p_sale_date DATE DEFAULT NULL
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
        container_size_id, container_condition_id, sale_date, created_at
    )
    VALUES (
        NULL, v_company_id, p_pic_id, 'Won', p_total_units, p_buying_cost, p_revenue, v_profit,
        p_container_size_id, p_container_condition_id, p_sale_date,
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

NOTIFY pgrst, 'reload schema';
