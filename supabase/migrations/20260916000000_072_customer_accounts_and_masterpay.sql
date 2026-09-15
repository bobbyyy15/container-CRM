-- Customer accounts, Masterpay, and the Sales Tracker corrections.
--
-- 1. Customer accounts. The company was the only customer identity: customer_accounts_view
--    grouped Won sales by company_id, and a sale found its company by contact or by name.
--    The client runs more than one account under the same company, each with its own Client
--    ID, so two accounts with one company name merged into a single Active Client. A
--    customer account is now a row of its own -- a Client ID, the company it belongs to, and
--    the date of its first transaction -- and every sale belongs to exactly one. The company
--    stays the record of who the business is; the account is who the sale was for.
--
--    First Transaction is required when a sale is recorded: either it opens a new account,
--    or it names the existing one. Nothing matches an account by company name.
--
--    Existing data: each company that already has sales gets one account, dated by its
--    earliest sale, and all its sales move onto it. That is exactly what the old company-level
--    rollup showed, so no figure changes; separating accounts from here on is a person's call.
--
-- 2. Masterpay. The operational record of payment against a sale -- payment status, date and
--    amount, vendor invoice reference, unit location, mark-up, credit, release date, remarks.
--    Everything else on the Masterpay sheet (invoice, release, customer, contact, container,
--    money) already lives on the sale, its account, company and contact, and is read from
--    there rather than copied. Masterpay is the only place a payment date is kept; Sales
--    Tracker reads it through.
--
-- 3. Size and condition on a sale converted from a quotation. convert_quotation_to_sale never
--    stored either, so the sale depended on the inquiry behind the quotation for both. It now
--    copies them, and the existing sales are filled in from their inquiries.
--
-- 4. Money. gross_profit is kept equal to revenue - buying_cost by the database itself, so no
--    write path can store a profit that the two totals do not support.
--
-- Naming: sales.sale_number is shown as the Release Number and sales.invoice_number as the
-- Invoice Number. The columns keep their names; renaming sale_number would touch its
-- allocator, trigger, uniqueness index and format check for no change in what is stored.

-- ── 1. Customer accounts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    client_code TEXT NOT NULL,
    first_transaction_date DATE NOT NULL,
    owner_pic_id UUID REFERENCES public.pics(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_accounts_client_code_present CHECK (btrim(client_code) <> '')
);

COMMENT ON TABLE public.customer_accounts IS
  'A customer account: one Client ID under a company. The same company may hold several.';
COMMENT ON COLUMN public.customer_accounts.client_code IS 'The Client ID / Customer ID the client uses.';

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_client_code_unique
  ON public.customer_accounts (upper(btrim(client_code)));
CREATE INDEX IF NOT EXISTS customer_accounts_company_idx ON public.customer_accounts(company_id);
CREATE INDEX IF NOT EXISTS customer_accounts_owner_pic_idx
  ON public.customer_accounts(owner_pic_id) WHERE owner_pic_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_timestamp_customer_accounts ON public.customer_accounts;
CREATE TRIGGER set_timestamp_customer_accounts
BEFORE UPDATE ON public.customer_accounts FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer accounts readable by authenticated users" ON public.customer_accounts;
CREATE POLICY "Customer accounts readable by authenticated users"
    ON public.customer_accounts FOR SELECT TO authenticated USING (true);

/**
 * The next free Client ID, CID-00001 onward, from the shared document counter. A Client ID
 * typed by hand can already hold the next number, so it keeps counting until one is free.
 */
CREATE OR REPLACE FUNCTION public.next_client_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next INTEGER;
    v_code TEXT;
BEGIN
    LOOP
        INSERT INTO public.document_counters (prefix, year, last_value)
        VALUES ('CID', 0, 1)
        ON CONFLICT (prefix, year)
        DO UPDATE SET last_value = public.document_counters.last_value + 1
        RETURNING last_value INTO v_next;

        v_code := 'CID-' || lpad(v_next::TEXT, 5, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.customer_accounts WHERE upper(btrim(client_code)) = v_code
        );
    END LOOP;
    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.next_client_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_client_code() TO service_role;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS sales_customer_account_idx ON public.sales(customer_account_id);

-- One account for each company that already has sales, dated by its earliest sale and owned
-- by the PIC who already owns the company (or who made that first sale).
INSERT INTO public.customer_accounts (company_id, client_code, first_transaction_date, owner_pic_id)
SELECT first_sale.company_id, public.next_client_code(), first_sale.first_date,
       COALESCE(company.account_owner_pic_id, first_sale.pic_id)
FROM (
    SELECT DISTINCT ON (sale.company_id)
        sale.company_id,
        COALESCE(sale.sale_date, sale.created_at::DATE) AS first_date,
        sale.pic_id
    FROM public.sales sale
    ORDER BY sale.company_id, COALESCE(sale.sale_date, sale.created_at::DATE), sale.created_at, sale.id
) first_sale
JOIN public.companies company ON company.id = first_sale.company_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.customer_accounts account WHERE account.company_id = first_sale.company_id
)
ORDER BY first_sale.first_date, first_sale.company_id;

UPDATE public.sales sale
SET customer_account_id = account.id
FROM public.customer_accounts account
WHERE sale.customer_account_id IS NULL
  AND account.company_id = sale.company_id;

ALTER TABLE public.sales ALTER COLUMN customer_account_id SET NOT NULL;

COMMENT ON COLUMN public.sales.sale_number IS 'Release Number (WAVE-nnnnn). Shown as Release Number; the column keeps its original name.';
COMMENT ON COLUMN public.sales.invoice_number IS 'Invoice Number, the primary reference on Sales Tracker.';

-- An inquiry is tied to an account when that is known: raised from an Active Client, or the
-- only account its company has.
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inquiries_customer_account_idx
  ON public.inquiries(customer_account_id) WHERE customer_account_id IS NOT NULL;

UPDATE public.inquiries inquiry
SET customer_account_id = only_account.id
FROM (
    SELECT company_id, (array_agg(id))[1] AS id
    FROM public.customer_accounts
    GROUP BY company_id
    HAVING COUNT(*) = 1
) only_account
WHERE inquiry.customer_account_id IS NULL
  AND inquiry.company_id = only_account.company_id;

-- ── 2. What the database guarantees about a sale ────────────────────────────────────────
-- A sale belongs to its account's company, and its profit is its revenue less its cost.
CREATE OR REPLACE FUNCTION public.enforce_sale_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_company UUID;
BEGIN
    SELECT company_id INTO v_account_company
    FROM public.customer_accounts WHERE id = NEW.customer_account_id;

    IF v_account_company IS NULL THEN
        RAISE EXCEPTION 'A sale must belong to an existing customer account' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.company_id IS DISTINCT FROM v_account_company THEN
        RAISE EXCEPTION 'A sale must belong to the same company as its customer account' USING ERRCODE = 'P0001';
    END IF;

    NEW.gross_profit := NEW.revenue - NEW.buying_cost;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sale_integrity_trigger ON public.sales;
CREATE TRIGGER enforce_sale_integrity_trigger
BEFORE INSERT OR UPDATE OF company_id, customer_account_id, revenue, buying_cost, gross_profit ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_integrity();

-- ── 3. Active Clients, one row per account ──────────────────────────────────────────────
-- The existing columns keep their names, types and order (the API and every screen read
-- them); the account's own columns are added at the end. Only Won sales count, so a
-- Cancelled sale stays visible in Sales Tracker without adding to any client total.
CREATE OR REPLACE VIEW public.customer_accounts_view AS
WITH account_sales AS (
    SELECT
        sale.customer_account_id,
        MAX(sale.created_at) AS last_purchase_date,
        COUNT(sale.id) AS sales_count,
        SUM(sale.total_units) AS total_units,
        SUM(sale.revenue) AS total_revenue,
        SUM(sale.gross_profit) AS total_gross_profit,
        (array_agg(sale.pic_id ORDER BY sale.created_at, sale.id) FILTER (WHERE sale.pic_id IS NOT NULL))[1] AS first_sale_pic_id
    FROM public.sales sale
    WHERE sale.status = 'Won'
    GROUP BY sale.customer_account_id
)
SELECT
    account.company_id,
    COALESCE(account.owner_pic_id, company.account_owner_pic_id, totals.first_sale_pic_id) AS pic_id,
    pic.name AS pic_name,
    company.name AS company_name,
    company.address_state AS state,
    company.address_country AS country,
    totals.last_purchase_date,
    totals.sales_count,
    totals.total_units,
    totals.total_revenue,
    totals.total_gross_profit,
    CASE
        WHEN totals.last_purchase_date >= NOW() - INTERVAL '3 months' THEN 'Active'
        ELSE 'Floating'
    END AS status,
    (
        SELECT row_to_json(contact.*)
        FROM public.contacts contact
        JOIN public.company_contacts company_contact ON company_contact.contact_id = contact.id
        WHERE company_contact.company_id = account.company_id
          AND company_contact.is_primary = true
        LIMIT 1
    ) AS primary_contact,
    account.id AS customer_account_id,
    account.client_code,
    account.first_transaction_date
FROM account_sales totals
JOIN public.customer_accounts account ON account.id = totals.customer_account_id
JOIN public.companies company ON company.id = account.company_id
LEFT JOIN public.pics pic ON pic.id = COALESCE(account.owner_pic_id, company.account_owner_pic_id, totals.first_sale_pic_id);

GRANT SELECT ON public.customer_accounts_view TO authenticated;
GRANT SELECT ON public.customer_accounts_view TO service_role;

-- ── 4. Which account a new sale belongs to ──────────────────────────────────────────────
/**
 * First Transaction decides it, and it may not be left out.
 *
 *   true   opens a new account under p_company_id, with the given Client ID or the next one.
 *   false  adds to the account named by id or Client ID, which must already exist and, when
 *          a company is given, belong to that company.
 */
CREATE OR REPLACE FUNCTION public.resolve_sale_customer_account(
    p_company_id UUID,
    p_first_transaction BOOLEAN,
    p_customer_account_id UUID,
    p_client_code TEXT,
    p_first_transaction_date DATE,
    p_owner_pic_id UUID
)
RETURNS public.customer_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account public.customer_accounts%ROWTYPE;
    v_code TEXT := NULLIF(btrim(p_client_code), '');
BEGIN
    IF p_first_transaction IS NULL THEN
        RAISE EXCEPTION 'First Transaction is required: say whether this sale opens a new customer account or belongs to an existing one'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_first_transaction THEN
        IF p_customer_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'A first transaction opens a new customer account, so it cannot also name an existing one'
                USING ERRCODE = 'P0001';
        END IF;
        IF p_company_id IS NULL THEN
            RAISE EXCEPTION 'A first transaction needs the company the new account belongs to' USING ERRCODE = 'P0001';
        END IF;
        IF v_code IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.customer_accounts WHERE upper(btrim(client_code)) = upper(v_code)
        ) THEN
            RAISE EXCEPTION 'Client ID % already belongs to another customer account', v_code USING ERRCODE = 'P0001';
        END IF;

        INSERT INTO public.customer_accounts (company_id, client_code, first_transaction_date, owner_pic_id)
        VALUES (
            p_company_id,
            COALESCE(v_code, public.next_client_code()),
            COALESCE(p_first_transaction_date, (NOW() AT TIME ZONE 'UTC')::DATE),
            p_owner_pic_id
        )
        RETURNING * INTO v_account;
        RETURN v_account;
    END IF;

    IF p_customer_account_id IS NOT NULL THEN
        SELECT * INTO v_account FROM public.customer_accounts WHERE id = p_customer_account_id;
    ELSIF v_code IS NOT NULL THEN
        SELECT * INTO v_account FROM public.customer_accounts WHERE upper(btrim(client_code)) = upper(v_code);
    ELSE
        RAISE EXCEPTION 'Choose the existing customer account (Client ID) this sale belongs to' USING ERRCODE = 'P0001';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer account % was not found', COALESCE(v_code, p_customer_account_id::TEXT) USING ERRCODE = 'P0001';
    END IF;
    IF v_code IS NOT NULL AND upper(btrim(v_account.client_code)) <> upper(v_code) THEN
        RAISE EXCEPTION 'Client ID % does not match the chosen customer account', v_code USING ERRCODE = 'P0001';
    END IF;
    IF p_company_id IS NOT NULL AND v_account.company_id <> p_company_id THEN
        RAISE EXCEPTION 'Customer account % belongs to a different company', v_account.client_code USING ERRCODE = 'P0001';
    END IF;

    RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_sale_customer_account(UUID, BOOLEAN, UUID, TEXT, DATE, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sale_customer_account(UUID, BOOLEAN, UUID, TEXT, DATE, UUID) TO service_role;

-- ── 5. Recording a sale by hand ─────────────────────────────────────────────────────────
-- 071's function, with the account decision added. A sale for an existing account takes the
-- account's company rather than finding a company by name.
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
        RAISE EXCEPTION 'First Transaction is required: say whether this sale opens a new customer account or belongs to an existing one'
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

        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(
            v_company_id, true, p_customer_account_id, p_client_code,
            COALESCE(p_sale_date, (NOW() AT TIME ZONE 'UTC')::DATE), p_pic_id
        );
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

-- Adding parameters made a new overload; the 071 signature would otherwise stay callable
-- and let a sale in without an account decision.
DROP FUNCTION IF EXISTS public.create_manual_sale(
    UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE, TEXT, TEXT, UUID, TEXT
);

REVOKE ALL ON FUNCTION public.create_manual_sale(
    UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE, TEXT, TEXT, UUID, TEXT, BOOLEAN, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_sale(
    UUID, TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE, TEXT, TEXT, UUID, TEXT, BOOLEAN, UUID, TEXT
) TO service_role;

-- ── 6. Recording the sale an accepted quotation became ──────────────────────────────────
-- 010's function, now storing the inquiry's size and condition on the sale, dating it, and
-- placing it on a customer account. When First Transaction is not given, an inquiry already
-- tied to an account answers it; otherwise it is required like any other sale.
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
        SELECT * INTO v_account
        FROM public.resolve_sale_customer_account(
            v_quotation.company_id, true, p_customer_account_id, p_client_code,
            COALESCE(p_sale_date, (NOW() AT TIME ZONE 'UTC')::DATE), v_quotation.pic_id
        );
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

DROP FUNCTION IF EXISTS public.convert_quotation_to_sale(UUID, UUID, INTEGER, NUMERIC, NUMERIC);

REVOKE ALL ON FUNCTION public.convert_quotation_to_sale(UUID, UUID, INTEGER, NUMERIC, NUMERIC, BOOLEAN, UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale(UUID, UUID, INTEGER, NUMERIC, NUMERIC, BOOLEAN, UUID, TEXT, DATE) TO service_role;

-- Sales already converted from a quotation take the size and condition of their inquiry,
-- only where the sale has none of its own.
UPDATE public.sales sale
SET container_size_id = COALESCE(sale.container_size_id, inquiry.container_size_id),
    container_condition_id = COALESCE(sale.container_condition_id, inquiry.container_condition_id)
FROM public.quotations quote
JOIN public.inquiries inquiry ON inquiry.id = quote.inquiry_id
WHERE quote.id = sale.quotation_id
  AND (sale.container_size_id IS NULL OR sale.container_condition_id IS NULL)
  AND (inquiry.container_size_id IS NOT NULL OR inquiry.container_condition_id IS NOT NULL);

-- ── 7. Masterpay ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.masterpay_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- One payment record per sale. RESTRICT: a sale with payment history is not deleted
    -- out from under it.
    sale_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
    payment_status TEXT NOT NULL DEFAULT 'Unpaid',
    payment_date DATE,
    payment_amount NUMERIC(12, 2),
    vendor_invoice_reference TEXT,
    unit_location TEXT,
    additional_markup NUMERIC(12, 2) NOT NULL DEFAULT 0,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    release_date DATE,
    remarks TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT masterpay_payment_status_valid CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid')),
    -- A recorded payment has a date; an unpaid record has none, so Sales Tracker shows it unpaid.
    CONSTRAINT masterpay_payment_date_matches_status CHECK (
        (payment_status = 'Unpaid' AND payment_date IS NULL)
        OR (payment_status <> 'Unpaid' AND payment_date IS NOT NULL)
    ),
    CONSTRAINT masterpay_money_not_negative CHECK (
        (payment_amount IS NULL OR payment_amount >= 0) AND additional_markup >= 0 AND credit >= 0
    )
);

COMMENT ON TABLE public.masterpay_records IS
  'Masterpay: payment against a sale. The only source of a sale''s payment date.';

CREATE INDEX IF NOT EXISTS masterpay_records_payment_status_idx ON public.masterpay_records(payment_status);
CREATE INDEX IF NOT EXISTS masterpay_records_payment_date_idx ON public.masterpay_records(payment_date) WHERE payment_date IS NOT NULL;

DROP TRIGGER IF EXISTS set_timestamp_masterpay_records ON public.masterpay_records;
CREATE TRIGGER set_timestamp_masterpay_records
BEFORE UPDATE ON public.masterpay_records FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

ALTER TABLE public.masterpay_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Masterpay readable by authenticated users" ON public.masterpay_records;
CREATE POLICY "Masterpay readable by authenticated users"
    ON public.masterpay_records FOR SELECT TO authenticated USING (true);

-- ── 8. Live updates for the new tables ──────────────────────────────────────────────────
DO $$
DECLARE
    v_table TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RETURN;
    END IF;
    FOREACH v_table IN ARRAY ARRAY['customer_accounts', 'masterpay_records'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
