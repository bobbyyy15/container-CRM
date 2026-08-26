-- Run against a local database only. Every test record is rolled back.
BEGIN;

DO $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_inquiry_id UUID;
    v_quote_id UUID;
    v_quote_again UUID;
    v_sale_id UUID;
    v_sale_again UUID;
    v_status TEXT;
BEGIN
    INSERT INTO public.companies (name)
    VALUES ('Lifecycle Smoke Test Company')
    RETURNING id INTO v_company_id;

    INSERT INTO public.contacts (first_name, last_name, email_active, email_active_normalized)
    VALUES ('Lifecycle', 'Tester', 'lifecycle-smoke@example.test', 'lifecycle-smoke@example.test')
    RETURNING id INTO v_contact_id;

    INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
    VALUES (v_company_id, v_contact_id, true);

    INSERT INTO public.inquiries (company_id, contact_id, requirements)
    VALUES (v_company_id, v_contact_id, 'Two 40ft containers')
    RETURNING id INTO v_inquiry_id;

    SELECT id INTO v_quote_id
    FROM public.create_quotation_from_inquiry(
        v_inquiry_id,
        '[{"description":"40ft container","quantity":2,"unit_price":5000}]'::jsonb,
        NULL
    );

    SELECT id INTO v_quote_again
    FROM public.create_quotation_from_inquiry(
        v_inquiry_id,
        '[{"description":"ignored retry","quantity":1,"unit_price":1}]'::jsonb,
        NULL
    );

    IF v_quote_id IS DISTINCT FROM v_quote_again THEN
        RAISE EXCEPTION 'Quotation retry was not idempotent';
    END IF;

    SELECT status INTO v_status FROM public.inquiries WHERE id = v_inquiry_id;
    IF v_status <> 'Quotation Created' THEN
        RAISE EXCEPTION 'Inquiry did not leave the active inquiry funnel';
    END IF;

    UPDATE public.quotations SET status = 'Accepted' WHERE id = v_quote_id;

    SELECT id INTO v_sale_id
    FROM public.convert_quotation_to_sale(v_quote_id, NULL, 2, 7000, 10000);

    SELECT id INTO v_sale_again
    FROM public.convert_quotation_to_sale(v_quote_id, NULL, 2, 7000, 10000);

    IF v_sale_id IS DISTINCT FROM v_sale_again THEN
        RAISE EXCEPTION 'Sale retry was not idempotent';
    END IF;

    SELECT status INTO v_status FROM public.quotations WHERE id = v_quote_id;
    IF v_status <> 'Converted' THEN
        RAISE EXCEPTION 'Quotation did not leave the active quotation funnel';
    END IF;

    SELECT status INTO v_status FROM public.inquiries WHERE id = v_inquiry_id;
    IF v_status <> 'Converted to Sale' THEN
        RAISE EXCEPTION 'Inquiry was not marked converted to sale';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.sales
        WHERE id = v_sale_id AND gross_profit = 3000 AND status = 'Won'
    ) THEN
        RAISE EXCEPTION 'Sale totals or status are incorrect';
    END IF;

    RAISE NOTICE 'Inquiry -> Quotation -> Sale lifecycle passed';
END;
$$;

ROLLBACK;
