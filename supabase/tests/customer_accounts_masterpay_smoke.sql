-- Migration 072: customer accounts, Masterpay, and sales placed on an account.
-- Run against a local database only. Every test record is rolled back.
BEGIN;

DO $$
DECLARE
    v_sale_a public.sales%ROWTYPE;
    v_sale_b public.sales%ROWTYPE;
    v_repeat public.sales%ROWTYPE;
    v_cancelled public.sales%ROWTYPE;
    v_account_rows INTEGER;
    v_units BIGINT;
    v_raised BOOLEAN;
    v_size UUID;
    v_condition UUID;
    v_company UUID;
    v_contact UUID;
    v_inquiry UUID;
    v_quote UUID;
    v_quote_sale public.sales%ROWTYPE;
BEGIN
    -- Same company, two first transactions with their own Client IDs: two accounts.
    SELECT * INTO v_sale_a FROM public.create_manual_sale(
        NULL, 'Smoke Twin Accounts Co', p_total_units => 2, p_buying_cost => 2000, p_revenue => 3000,
        p_state_province => 'TX', p_country => 'US', p_first_transaction => true, p_client_code => 'SMOKE-A');
    SELECT * INTO v_sale_b FROM public.create_manual_sale(
        NULL, 'Smoke Twin Accounts Co', p_total_units => 1, p_buying_cost => 500, p_revenue => 900,
        p_state_province => 'TX', p_country => 'US', p_first_transaction => true, p_client_code => 'SMOKE-B');

    ASSERT v_sale_a.company_id = v_sale_b.company_id, 'both sales belong to the one company';
    ASSERT v_sale_a.customer_account_id <> v_sale_b.customer_account_id, 'but to two customer accounts';

    SELECT COUNT(*) INTO v_account_rows FROM public.customer_accounts_view WHERE company_id = v_sale_a.company_id;
    ASSERT v_account_rows = 2, 'Active Clients shows the two accounts separately, not merged by company';

    -- A repeat sale named by Client ID lands on that account only.
    SELECT * INTO v_repeat FROM public.create_manual_sale(
        NULL, NULL, p_total_units => 3, p_buying_cost => 3000, p_revenue => 4500,
        p_first_transaction => false, p_client_code => 'smoke-a');
    ASSERT v_repeat.customer_account_id = v_sale_a.customer_account_id, 'repeat sale joins SMOKE-A';
    SELECT total_units INTO v_units FROM public.customer_accounts_view WHERE customer_account_id = v_sale_a.customer_account_id;
    ASSERT v_units = 5, 'SMOKE-A totals its own two sales';

    -- First Transaction is required.
    v_raised := false;
    BEGIN
        PERFORM public.create_manual_sale(NULL, 'Smoke Twin Accounts Co', p_total_units => 1, p_buying_cost => 1, p_revenue => 2);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_raised := SQLERRM LIKE 'First Transaction is required%';
    END;
    ASSERT v_raised, 'a sale without a First Transaction answer is refused';

    -- A first transaction reusing a Client ID is refused.
    v_raised := false;
    BEGIN
        PERFORM public.create_manual_sale(NULL, 'Other Co', p_total_units => 1, p_buying_cost => 1, p_revenue => 2,
            p_first_transaction => true, p_client_code => 'SMOKE-B');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_raised := true;
    END;
    ASSERT v_raised, 'a Client ID cannot open a second account';

    -- The database keeps profit equal to revenue less cost.
    UPDATE public.sales SET gross_profit = 999999 WHERE id = v_sale_a.id RETURNING * INTO v_sale_a;
    ASSERT v_sale_a.gross_profit = 1000, 'gross profit cannot be set apart from revenue and cost';

    -- A Cancelled sale stays a record but is not counted.
    SELECT * INTO v_cancelled FROM public.create_manual_sale(
        NULL, NULL, p_total_units => 10, p_buying_cost => 1, p_revenue => 2, p_status => 'Cancelled',
        p_first_transaction => false, p_customer_account_id => v_sale_b.customer_account_id);
    ASSERT EXISTS (SELECT 1 FROM public.sales WHERE id = v_cancelled.id), 'the cancelled sale is kept';
    SELECT total_units INTO v_units FROM public.customer_accounts_view WHERE customer_account_id = v_sale_b.customer_account_id;
    ASSERT v_units = 1, 'the cancelled sale adds nothing to its account totals';

    -- Masterpay: one record per sale; a recorded payment needs a date; a paid sale keeps its history.
    INSERT INTO public.masterpay_records (sale_id, payment_status, payment_date, payment_amount)
    VALUES (v_sale_a.id, 'Paid', CURRENT_DATE, 3000);

    v_raised := false;
    BEGIN
        INSERT INTO public.masterpay_records (sale_id, payment_status) VALUES (v_sale_b.id, 'Paid');
    EXCEPTION WHEN check_violation THEN
        v_raised := true;
    END;
    ASSERT v_raised, 'a Paid record without a payment date is refused';

    v_raised := false;
    BEGIN
        INSERT INTO public.masterpay_records (sale_id, payment_status) VALUES (v_sale_a.id, 'Unpaid');
    EXCEPTION WHEN unique_violation THEN
        v_raised := true;
    END;
    ASSERT v_raised, 'a sale has at most one Masterpay record';

    v_raised := false;
    BEGIN
        DELETE FROM public.sales WHERE id = v_sale_a.id;
    EXCEPTION WHEN foreign_key_violation THEN
        v_raised := true;
    END;
    ASSERT v_raised, 'a sale with a payment record is not deleted';

    -- A quotation sale copies the inquiry's size and condition and joins the inquiry's account.
    SELECT id INTO v_size FROM public.container_sizes WHERE name = '40ft HC';
    SELECT id INTO v_condition FROM public.container_conditions WHERE name = 'Cargo Worthy';
    v_company := v_sale_a.company_id;
    INSERT INTO public.contacts (first_name, email_active, email_active_normalized)
    VALUES ('Smoke', 'smoke-accounts@example.test', 'smoke-accounts@example.test') RETURNING id INTO v_contact;
    INSERT INTO public.company_contacts (company_id, contact_id, is_primary) VALUES (v_company, v_contact, false);
    INSERT INTO public.inquiries (company_id, contact_id, requirements, container_size_id, container_condition_id, quantity, customer_account_id)
    VALUES (v_company, v_contact, 'Two 40ft HC', v_size, v_condition, 2, v_sale_b.customer_account_id)
    RETURNING id INTO v_inquiry;
    SELECT id INTO v_quote FROM public.create_quotation_from_inquiry(
        v_inquiry, '[{"description":"40ft HC","quantity":2,"unit_price":4000}]'::jsonb, NULL);
    UPDATE public.quotations SET status = 'Accepted' WHERE id = v_quote;
    SELECT * INTO v_quote_sale FROM public.convert_quotation_to_sale(v_quote, NULL, 2, 6000, 8000);

    ASSERT v_quote_sale.container_size_id = v_size, 'size copied from the inquiry';
    ASSERT v_quote_sale.container_condition_id = v_condition, 'condition copied from the inquiry';
    ASSERT v_quote_sale.customer_account_id = v_sale_b.customer_account_id, 'the inquiry''s account answers First Transaction';

    RAISE NOTICE 'customer accounts + masterpay smoke test passed';
END $$;

ROLLBACK;
