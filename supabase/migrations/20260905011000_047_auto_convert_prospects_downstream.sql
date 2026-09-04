-- 047_auto_convert_prospects_downstream.sql
-- Ensures that whenever a client enters Warm Leads, Inquiries, or Sales/Customer Accounts,
-- they are automatically marked as converted in prospect_clients so they no longer show in Prospect Clients.

-- 1. Trigger function to synchronize prospect lifecycle
CREATE OR REPLACE FUNCTION public.sync_prospect_to_converted_on_downstream()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_TABLE_NAME = 'warm_leads' THEN
        IF NEW.status = 'active' THEN
            UPDATE public.prospect_clients
            SET lifecycle_status = 'converted',
                converted_at = COALESCE(converted_at, NOW())
            WHERE (company_id = NEW.company_id OR (contact_id IS NOT NULL AND contact_id = NEW.contact_id))
              AND lifecycle_status = 'active';
        END IF;
    ELSIF TG_TABLE_NAME = 'inquiries' THEN
        IF NEW.status NOT IN ('Lost', 'Removed') THEN
            UPDATE public.prospect_clients
            SET lifecycle_status = 'converted',
                converted_at = COALESCE(converted_at, NOW())
            WHERE (company_id = NEW.company_id OR (contact_id IS NOT NULL AND contact_id = NEW.contact_id))
              AND lifecycle_status = 'active';
        END IF;
    ELSIF TG_TABLE_NAME = 'sales' THEN
        IF NEW.status = 'Won' THEN
            UPDATE public.prospect_clients
            SET lifecycle_status = 'converted',
                converted_at = COALESCE(converted_at, NOW())
            WHERE company_id = NEW.company_id
              AND lifecycle_status = 'active';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Attach Triggers
DROP TRIGGER IF EXISTS trg_sync_prospect_on_warm_lead ON public.warm_leads;
CREATE TRIGGER trg_sync_prospect_on_warm_lead
AFTER INSERT OR UPDATE OF status, company_id, contact_id
ON public.warm_leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_prospect_to_converted_on_downstream();

DROP TRIGGER IF EXISTS trg_sync_prospect_on_inquiry ON public.inquiries;
CREATE TRIGGER trg_sync_prospect_on_inquiry
AFTER INSERT OR UPDATE OF status, company_id, contact_id
ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.sync_prospect_to_converted_on_downstream();

DROP TRIGGER IF EXISTS trg_sync_prospect_on_sale ON public.sales;
CREATE TRIGGER trg_sync_prospect_on_sale
AFTER INSERT OR UPDATE OF status, company_id
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_prospect_to_converted_on_downstream();

-- 3. Retroactive update: mark existing active prospects as converted if already in Warm Leads, Inquiries, or Sales
UPDATE public.prospect_clients
SET lifecycle_status = 'converted',
    converted_at = COALESCE(converted_at, NOW())
WHERE lifecycle_status = 'active'
  AND (
      company_id IN (
          SELECT company_id FROM public.warm_leads WHERE status = 'active'
          UNION
          SELECT company_id FROM public.inquiries WHERE status NOT IN ('Lost', 'Removed')
          UNION
          SELECT company_id FROM public.sales WHERE status = 'Won'
      )
      OR
      (contact_id IS NOT NULL AND contact_id IN (
          SELECT contact_id FROM public.warm_leads WHERE status = 'active'
          UNION
          SELECT contact_id FROM public.inquiries WHERE status NOT IN ('Lost', 'Removed')
      ))
  );

NOTIFY pgrst, 'reload schema';
