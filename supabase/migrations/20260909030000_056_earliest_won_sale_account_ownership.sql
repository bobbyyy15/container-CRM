-- A customer account belongs to the PIC who recorded its earliest Won sale.
--
-- The company is the account boundary. Once claimed, it must not re-enter Prospect or
-- Warm Leads for any PIC; repeat business starts from the existing customer account.
-- Historical rows are retained and moved out of active working lists for auditability.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS account_owner_pic_id UUID REFERENCES public.pics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS companies_account_owner_pic_idx
  ON public.companies(account_owner_pic_id)
  WHERE account_owner_pic_id IS NOT NULL;

-- Establish the owner of every existing customer deterministically from the earliest
-- successful sale. A Won sale without a PIC cannot establish salesperson ownership.
WITH earliest_won AS (
  SELECT company_id, pic_id, created_at
  FROM (
    SELECT
      company_id,
      pic_id,
      created_at,
      row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS position
    FROM public.sales
    WHERE status = 'Won' AND pic_id IS NOT NULL
  ) ranked
  WHERE position = 1
)
UPDATE public.companies company
SET
  account_owner_pic_id = earliest.pic_id,
  account_claimed_at = earliest.created_at
FROM earliest_won earliest
WHERE company.id = earliest.company_id;

-- Existing accounts no longer belong in lead-generation working lists. Preserve the
-- rows and their history, but move them to the normal converted state.
UPDATE public.prospect_clients prospect
SET
  lifecycle_status = 'converted',
  converted_at = COALESCE(prospect.converted_at, company.account_claimed_at, NOW()),
  conversion_reason = COALESCE(prospect.conversion_reason, 'Company became an existing customer account'),
  conversion_channel = COALESCE(prospect.conversion_channel, 'Won sale')
FROM public.companies company
WHERE company.id = prospect.company_id
  AND company.account_owner_pic_id IS NOT NULL
  AND prospect.lifecycle_status = 'active';

UPDATE public.warm_leads warm
SET
  status = 'converted',
  converted_at = COALESCE(warm.converted_at, company.account_claimed_at, NOW())
FROM public.companies company
WHERE company.id = warm.company_id
  AND company.account_owner_pic_id IS NOT NULL
  AND warm.status = 'active';

-- Recalculate a company's owner from the current sale history. Locking the company row
-- serializes simultaneous Won sales so two PICs cannot both claim the same account.
CREATE OR REPLACE FUNCTION public.recompute_company_account_owner(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_owner UUID;
  v_owner UUID;
  v_claimed_at TIMESTAMPTZ;
BEGIN
  SELECT account_owner_pic_id
  INTO v_previous_owner
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT sale.pic_id, sale.created_at
  INTO v_owner, v_claimed_at
  FROM public.sales sale
  WHERE sale.company_id = p_company_id
    AND sale.status = 'Won'
    AND sale.pic_id IS NOT NULL
  ORDER BY sale.created_at, sale.id
  LIMIT 1;

  UPDATE public.companies
  SET
    account_owner_pic_id = v_owner,
    account_claimed_at = v_claimed_at
  WHERE id = p_company_id;

  IF v_owner IS NOT NULL THEN
    UPDATE public.prospect_clients
    SET
      lifecycle_status = 'converted',
      converted_at = COALESCE(converted_at, v_claimed_at, NOW()),
      conversion_reason = COALESCE(conversion_reason, 'Company became an existing customer account'),
      conversion_channel = COALESCE(conversion_channel, 'Won sale')
    WHERE company_id = p_company_id
      AND lifecycle_status = 'active';

    UPDATE public.warm_leads
    SET
      status = 'converted',
      converted_at = COALESCE(converted_at, v_claimed_at, NOW())
    WHERE company_id = p_company_id
      AND status = 'active';
  END IF;

  IF v_previous_owner IS DISTINCT FROM v_owner THEN
    INSERT INTO public.domain_events(entity_type, entity_id, event_type, payload)
    VALUES (
      'company',
      p_company_id,
      CASE WHEN v_owner IS NULL THEN 'account_owner_released' ELSE 'account_owner_claimed' END,
      jsonb_build_object('previous_pic_id', v_previous_owner, 'owner_pic_id', v_owner, 'claimed_at', v_claimed_at)
    );
  END IF;

  RETURN v_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_company_account_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_company_account_owner(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_account_owner_from_won_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_owner_name TEXT;
BEGIN
  -- Recompute the old company when a Won sale is deleted, moved, demoted, or has its
  -- PIC changed. This also releases an account whose last Won sale is deleted.
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_company_account_owner(OLD.company_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'Won'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.pic_id IS DISTINCT FROM OLD.pic_id
     ) THEN
    PERFORM public.recompute_company_account_owner(OLD.company_id);
  END IF;

  IF NEW.status = 'Won' AND NEW.pic_id IS NOT NULL THEN
    v_owner := public.recompute_company_account_owner(NEW.company_id);
    IF v_owner IS DISTINCT FROM NEW.pic_id THEN
      SELECT name INTO v_owner_name FROM public.pics WHERE id = v_owner;
      RAISE EXCEPTION 'Existing account is owned by %; this sale cannot be assigned to another salesperson',
        COALESCE(v_owner_name, 'another salesperson')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_account_owner_from_won_sale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_account_owner_from_won_sale() TO service_role;

DROP TRIGGER IF EXISTS sync_account_owner_from_won_sale_trigger ON public.sales;
CREATE TRIGGER sync_account_owner_from_won_sale_trigger
AFTER INSERT OR UPDATE OF status, company_id, pic_id OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_account_owner_from_won_sale();

-- This final database guard covers manual creation, spreadsheet imports, and any future
-- write path. Removed/converted historical rows remain allowed; only active lead rows are
-- blocked for a company that is already an account.
CREATE OR REPLACE FUNCTION public.prevent_existing_account_in_lead_lists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_owner_name TEXT;
  v_is_active BOOLEAN;
BEGIN
  v_is_active := CASE
    WHEN TG_TABLE_NAME = 'prospect_clients' THEN NEW.lifecycle_status = 'active'
    WHEN TG_TABLE_NAME = 'warm_leads' THEN NEW.status = 'active'
    ELSE false
  END;

  IF NOT v_is_active THEN
    RETURN NEW;
  END IF;

  SELECT company.account_owner_pic_id, pic.name
  INTO v_owner, v_owner_name
  FROM public.companies company
  LEFT JOIN public.pics pic ON pic.id = company.account_owner_pic_id
  WHERE company.id = NEW.company_id;

  IF v_owner IS NOT NULL THEN
    IF NEW.pic_id = v_owner THEN
      RAISE EXCEPTION 'This company is already an Existing Account owned by your PIC; do not add it to Prospect or Warm Leads'
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'Existing account is owned by % and cannot be added to another salesperson''s Prospect or Warm Leads',
      COALESCE(v_owner_name, 'another salesperson')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_existing_account_in_lead_lists() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_existing_account_in_lead_lists() TO service_role;

DROP TRIGGER IF EXISTS prevent_existing_account_prospect_trigger ON public.prospect_clients;
CREATE TRIGGER prevent_existing_account_prospect_trigger
BEFORE INSERT OR UPDATE OF company_id, pic_id, lifecycle_status ON public.prospect_clients
FOR EACH ROW EXECUTE FUNCTION public.prevent_existing_account_in_lead_lists();

DROP TRIGGER IF EXISTS prevent_existing_account_warm_trigger ON public.warm_leads;
CREATE TRIGGER prevent_existing_account_warm_trigger
BEFORE INSERT OR UPDATE OF company_id, pic_id, status ON public.warm_leads
FOR EACH ROW EXECUTE FUNCTION public.prevent_existing_account_in_lead_lists();

-- Existing Accounts is a company-level rollup owned by the earliest Won-sale PIC. Sales
-- recorded under old duplicate PIC assignments remain in the totals but no longer create
-- a second Active Client row for another salesperson.
CREATE OR REPLACE VIEW public.customer_accounts_view AS
SELECT
  sale.company_id,
  COALESCE(company.account_owner_pic_id, sale.pic_id) AS pic_id,
  pic.name AS pic_name,
  company.name AS company_name,
  company.address_state AS state,
  company.address_country AS country,
  MAX(sale.created_at) AS last_purchase_date,
  COUNT(sale.id) AS sales_count,
  SUM(sale.total_units) AS total_units,
  SUM(sale.revenue) AS total_revenue,
  SUM(sale.gross_profit) AS total_gross_profit,
  CASE
    WHEN MAX(sale.created_at) >= NOW() - INTERVAL '3 months' THEN 'Active'
    ELSE 'Floating'
  END AS status,
  (
    SELECT row_to_json(contact.*)
    FROM public.contacts contact
    JOIN public.company_contacts company_contact ON company_contact.contact_id = contact.id
    WHERE company_contact.company_id = sale.company_id
      AND company_contact.is_primary = true
    LIMIT 1
  ) AS primary_contact
FROM public.sales sale
JOIN public.companies company ON company.id = sale.company_id
LEFT JOIN public.pics pic ON pic.id = COALESCE(company.account_owner_pic_id, sale.pic_id)
WHERE sale.status = 'Won'
GROUP BY
  sale.company_id,
  COALESCE(company.account_owner_pic_id, sale.pic_id),
  pic.name,
  company.name,
  company.address_state,
  company.address_country;

GRANT SELECT ON public.customer_accounts_view TO authenticated;
GRANT SELECT ON public.customer_accounts_view TO service_role;

NOTIFY pgrst, 'reload schema';
