-- First Transaction, as the client defines it.
--
-- "Pag first transaction, required phone at email; tapos sa mga second, may fast lookup na
-- nag-call ng mga active para sa mga repurchase." A new customer's first sale must carry the
-- customer's phone and email. Every later sale is a repurchase found by a fast lookup of the
-- existing clients -- not by typing a Client ID. The Client ID (Customer ID) stays on the
-- account and on Masterpay, but no one needs to know it to record a sale.
--
-- 1. An account's contact. The phone and email given on a first transaction belong to a
--    contact, and that contact is what a repurchase lookup, and an import, match on. It is
--    also what keeps two accounts under the same company apart. Existing accounts take their
--    company's primary contact.
--
-- 2. create_manual_sale and convert_quotation_to_sale refuse a first transaction without a
--    phone and an email, and refuse one whose phone or email already belongs to a customer
--    account -- that customer exists, so the sale is a repurchase.
--
-- 3. lookup_customer_accounts: the fast lookup, by phone, email, contact name, company name
--    or Customer ID, over the accounts on Active Clients.

-- ── 1. An account's contact ─────────────────────────────────────────────────────────────
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS customer_accounts_contact_idx
  ON public.customer_accounts(contact_id) WHERE contact_id IS NOT NULL;

UPDATE public.customer_accounts account
SET contact_id = link.contact_id
FROM (
    SELECT DISTINCT ON (company_id) company_id, contact_id
    FROM public.company_contacts
    ORDER BY company_id, is_primary DESC, contact_id
) link
WHERE account.contact_id IS NULL
  AND link.company_id = account.company_id;

/**
 * The customer account whose contact has this phone or email. Phones compare on their last
 * ten digits, so "+1 (719) 892-0252" and "719-892-0252" are the same number.
 */
CREATE OR REPLACE FUNCTION public.find_customer_account_by_contact(p_phone TEXT, p_email TEXT)
RETURNS SETOF public.customer_accounts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT account.*
    FROM public.customer_accounts account
    JOIN public.contacts contact ON contact.id = account.contact_id
    WHERE (
            public.normalize_email(p_email) IS NOT NULL
            AND public.normalize_email(p_email) IN (contact.email_active_normalized, contact.email_2_normalized)
          )
       OR (
            length(COALESCE(public.normalize_phone(p_phone), '')) >= 7
            AND right(public.normalize_phone(p_phone), 10) IN (right(contact.phone_direct_normalized, 10), right(contact.phone_2_normalized, 10))
          )
    ORDER BY account.created_at
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_customer_account_by_contact(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_customer_account_by_contact(TEXT, TEXT) TO service_role;

-- ── 2. Recording a sale by hand ─────────────────────────────────────────────────────────
-- 072's function; only the first-transaction branch changes.
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
    p_status TEXT DEFAULT 'Won',
    p_first_transaction BOOLEAN DEFAULT NULL,
    p_customer_account_id UUID DEFAULT NULL,
    p_client_code TEXT DEFAULT NULL
)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_account public.customer_accounts%ROWTYPE;
    v_existing public.customer_accounts%ROWTYPE;
    v_existing_company TEXT;
    v_sale public.sales%ROWTYPE;
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
    IF p_first_transaction IS NULL THEN
        RAISE EXCEPTION 'First Transaction is required: say whether this is a new client''s first sale or a repurchase'
            USING ERRCODE = 'P0001';
    END IF;
    -- A supplied release number has to look like one of theirs; a blank one is allocated by
    -- the trigger, which is what keeps the field editable without losing the series.
    IF NULLIF(btrim(p_sale_number), '') IS NOT NULL AND btrim(p_sale_number) !~ '^WAVE-[0-9]{3,10}$' THEN
        RAISE EXCEPTION 'Release number must look like WAVE-10317' USING ERRCODE = 'P0001';
    END IF;
    IF NULLIF(btrim(p_sale_number), '') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.sales WHERE upper(btrim(sale_number)) = upper(btrim(p_sale_number))) THEN
        RAISE EXCEPTION 'Release number % is already used', btrim(p_sale_number) USING ERRCODE = 'P0001';
    END IF;

    IF p_first_transaction THEN
        -- A new client is recorded with both ways to reach them, so a repurchase finds them again.
        IF NULLIF(btrim(p_phone), '') IS NULL OR NULLIF(btrim(p_email), '') IS NULL THEN
            RAISE EXCEPTION 'A first transaction needs the customer''s phone and email' USING ERRCODE = 'P0001';
        END IF;
        IF btrim(p_email) !~ '^[^@\s]+@[^@\s]+$' THEN
            RAISE EXCEPTION 'Email must contain an "@"' USING ERRCODE = 'P0001';
        END IF;

        -- That phone or email already belongs to a client: this is their repurchase.
        SELECT * INTO v_existing FROM public.find_customer_account_by_contact(p_phone, p_email);
        IF FOUND THEN
            SELECT name INTO v_existing_company FROM public.companies WHERE id = v_existing.company_id;
            RAISE EXCEPTION 'That phone or email already belongs to existing client % (%). Record this sale as a repurchase.',
                v_existing_company, v_existing.client_code USING ERRCODE = 'P0001';
        END IF;

        SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
        FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

        -- find_or_create_company_contact only creates a contact when a name is given; the
        -- account still needs one to be found by its phone and email.
        IF v_contact_id IS NULL THEN
            INSERT INTO public.contacts (first_name, phone_direct, email_active)
            VALUES (split_part(btrim(p_email), '@', 1), btrim(p_phone), btrim(p_email))
            RETURNING id INTO v_contact_id;

            INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
            VALUES (
                v_company_id, v_contact_id,
                NOT EXISTS (SELECT 1 FROM public.company_contacts WHERE company_id = v_company_id AND is_primary)
            )
            ON CONFLICT (company_id, contact_id) DO NOTHING;
        END IF;

        -- find_or_create_company_contact does not take a city, so fill it in when the company
        -- does not have one yet rather than overwriting what is on record.
        IF NULLIF(btrim(p_city), '') IS NOT NULL THEN
            UPDATE public.companies SET address_city = btrim(p_city)
            WHERE id = v_company_id AND (address_city IS NULL OR btrim(address_city) = '');
        END IF;

        IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
            RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(
            v_company_id, true, p_customer_account_id, p_client_code,
            COALESCE(p_sale_date, (NOW() AT TIME ZONE 'UTC')::DATE), p_pic_id
        );
        UPDATE public.customer_accounts SET contact_id = v_contact_id WHERE id = v_account.id;
    ELSE
        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(NULL, false, p_customer_account_id, p_client_code, NULL, NULL);
        v_company_id := v_account.company_id;

        IF public.is_pipeline_identity_removed(v_company_id, NULL, NULL, NULL, NULL, NULL) THEN
            RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    INSERT INTO public.sales (
        quotation_id, company_id, customer_account_id, pic_id, status, total_units, buying_cost, revenue, gross_profit,
        container_size_id, container_condition_id, container_category_id, sale_date,
        sale_number, invoice_number, created_at
    )
    VALUES (
        NULL, v_company_id, v_account.id, p_pic_id, p_status, p_total_units, p_buying_cost, p_revenue, p_revenue - p_buying_cost,
        p_container_size_id, p_container_condition_id, p_container_category_id, p_sale_date,
        NULLIF(btrim(p_sale_number), ''), NULLIF(btrim(p_invoice_number), ''),
        -- Dating the sale earlier dates the record too, so it lands in the right month on
        -- every report that groups by created_at.
        COALESCE(p_sale_date::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_sale;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('sale', v_sale.id, 'sale_created_manually', p_actor_id, jsonb_build_object(
        'company_id', v_company_id,
        'customer_account_id', v_account.id,
        'first_transaction', p_first_transaction,
        'gross_profit', v_sale.gross_profit
    ));

    RETURN NEXT v_sale;
END;
$$;

-- ── 3. Recording the sale an accepted quotation became ──────────────────────────────────
-- 072's function; a first transaction now needs the quotation's contact to have a phone and
-- an email, and that contact becomes the account's.
CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale(
    p_quotation_id UUID,
    p_actor_id UUID,
    p_total_units INTEGER,
    p_buying_cost NUMERIC,
    p_revenue NUMERIC,
    p_first_transaction BOOLEAN DEFAULT NULL,
    p_customer_account_id UUID DEFAULT NULL,
    p_client_code TEXT DEFAULT NULL,
    p_sale_date DATE DEFAULT NULL
)
RETURNS SETOF public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quotation public.quotations%ROWTYPE;
    v_sale public.sales%ROWTYPE;
    v_account public.customer_accounts%ROWTYPE;
    v_existing_company TEXT;
    v_size UUID;
    v_condition UUID;
    v_inquiry_account UUID;
    v_first_transaction BOOLEAN := p_first_transaction;
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
        RAISE EXCEPTION 'Sale values are invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_sale_date IS NOT NULL AND p_sale_date > (NOW() AT TIME ZONE 'UTC')::DATE + 1 THEN
        RAISE EXCEPTION 'A sale cannot be dated in the future' USING ERRCODE = 'P0001';
    END IF;

    SELECT container_size_id, container_condition_id, customer_account_id
    INTO v_size, v_condition, v_inquiry_account
    FROM public.inquiries
    WHERE id = v_quotation.inquiry_id;

    IF v_first_transaction IS NULL AND v_inquiry_account IS NOT NULL AND NULLIF(btrim(p_client_code), '') IS NULL THEN
        v_first_transaction := false;
    END IF;

    IF v_first_transaction IS TRUE THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.contacts
            WHERE id = v_quotation.contact_id
              AND COALESCE(NULLIF(btrim(email_active), ''), NULLIF(btrim(email_2), '')) IS NOT NULL
              AND COALESCE(NULLIF(btrim(phone_direct), ''), NULLIF(btrim(phone_2), '')) IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'A first transaction needs the customer''s phone and email: add both to the quotation''s contact first'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT company.name INTO v_existing_company
        FROM public.customer_accounts account
        JOIN public.companies company ON company.id = account.company_id
        WHERE account.contact_id = v_quotation.contact_id
        LIMIT 1;
        IF v_existing_company IS NOT NULL THEN
            RAISE EXCEPTION 'This contact already belongs to existing client %. Record this sale as a repurchase.', v_existing_company
                USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(
            v_quotation.company_id, true, p_customer_account_id, p_client_code,
            COALESCE(p_sale_date, (NOW() AT TIME ZONE 'UTC')::DATE), v_quotation.pic_id
        );
        UPDATE public.customer_accounts SET contact_id = v_quotation.contact_id WHERE id = v_account.id;
    ELSE
        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(
            v_quotation.company_id, v_first_transaction,
            COALESCE(p_customer_account_id, CASE WHEN NULLIF(btrim(p_client_code), '') IS NULL THEN v_inquiry_account END),
            p_client_code, NULL, NULL
        );
    END IF;

    INSERT INTO public.sales (
        quotation_id, company_id, customer_account_id, pic_id, status, total_units,
        buying_cost, revenue, gross_profit, container_size_id, container_condition_id, sale_date, created_at
    ) VALUES (
        v_quotation.id, v_quotation.company_id, v_account.id, v_quotation.pic_id, 'Won', p_total_units,
        p_buying_cost, p_revenue, p_revenue - p_buying_cost, v_size, v_condition, p_sale_date,
        COALESCE(p_sale_date::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_sale;

    UPDATE public.quotations SET status = 'Converted' WHERE id = v_quotation.id;
    UPDATE public.inquiries
    SET status = 'Converted to Sale',
        customer_account_id = COALESCE(customer_account_id, v_account.id)
    WHERE id = v_quotation.inquiry_id;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (
        'quotation', v_quotation.id, 'sale_won', p_actor_id,
        jsonb_build_object('sale_id', v_sale.id, 'customer_account_id', v_account.id, 'gross_profit', v_sale.gross_profit)
    );

    RETURN NEXT v_sale;
END;
$$;

-- ── 4. The fast lookup for a repurchase ─────────────────────────────────────────────────
/**
 * Existing clients matching what was typed: a phone (any formatting, 4+ digits), an email,
 * a contact or company name, or a Customer ID. Only accounts on Active Clients -- those with
 * a Won sale -- and, for a sales manager, only their own. Active clients come first.
 */
CREATE OR REPLACE FUNCTION public.lookup_customer_accounts(p_query TEXT, p_pic_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 8)
RETURNS TABLE (
    customer_account_id UUID,
    client_code TEXT,
    company_id UUID,
    company_name TEXT,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    state TEXT,
    status TEXT,
    last_purchase_date TIMESTAMPTZ,
    first_transaction_date DATE,
    sales_count BIGINT,
    pic_id UUID,
    pic_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_raw TEXT := btrim(COALESCE(p_query, ''));
    v_email TEXT;
    v_phone TEXT;
BEGIN
    IF length(v_raw) < 2 THEN
        RETURN;
    END IF;
    IF v_raw LIKE '%@%' THEN
        v_email := public.normalize_email(v_raw);
    END IF;
    -- Only text that is a phone number is searched as one; "CID-00012" is not a phone.
    IF v_raw !~ '[A-Za-z@]' THEN
        v_phone := public.normalize_phone(v_raw);
    END IF;

    RETURN QUERY
    SELECT
        accounts.customer_account_id,
        accounts.client_code,
        accounts.company_id,
        accounts.company_name,
        NULLIF(btrim(concat_ws(' ', contact.first_name, contact.last_name)), ''),
        COALESCE(contact.phone_direct, contact.phone_2),
        COALESCE(contact.email_active, contact.email_2),
        accounts.state,
        accounts.status,
        accounts.last_purchase_date,
        accounts.first_transaction_date,
        accounts.sales_count,
        accounts.pic_id,
        accounts.pic_name
    FROM public.customer_accounts_view accounts
    JOIN public.customer_accounts account ON account.id = accounts.customer_account_id
    LEFT JOIN public.contacts contact ON contact.id = account.contact_id
    WHERE (p_pic_id IS NULL OR accounts.pic_id = p_pic_id)
      AND (
            accounts.company_name ILIKE '%' || v_raw || '%'
         OR accounts.client_code ILIKE v_raw || '%'
         OR concat_ws(' ', contact.first_name, contact.last_name) ILIKE '%' || v_raw || '%'
         OR contact.email_active ILIKE '%' || v_raw || '%'
         OR contact.email_2 ILIKE '%' || v_raw || '%'
         OR (v_email IS NOT NULL AND v_email IN (contact.email_active_normalized, contact.email_2_normalized))
         OR (v_phone IS NOT NULL AND length(v_phone) >= 4 AND (
                contact.phone_direct_normalized LIKE '%' || v_phone || '%'
             OR contact.phone_2_normalized LIKE '%' || v_phone || '%'
             OR (length(v_phone) > 10 AND right(v_phone, 10) IN (contact.phone_direct_normalized, contact.phone_2_normalized))
         ))
      )
    ORDER BY (accounts.status = 'Active') DESC, accounts.last_purchase_date DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_customer_accounts(TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_customer_accounts(TEXT, UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
