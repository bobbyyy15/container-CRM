-- Migration 056's lead-list guard decided whether a row was "active" with one CASE
-- expression that named a column from each table in a different branch:
--
--   CASE WHEN TG_TABLE_NAME = 'prospect_clients' THEN NEW.lifecycle_status = 'active'
--        WHEN TG_TABLE_NAME = 'warm_leads'       THEN NEW.status = 'active' ...
--
-- plpgsql compiles that whole expression as one SQL statement before any branch is
-- chosen, and resolves NEW's fields against the actual row type at compile time. So on
-- prospect_clients it failed with `record "new" has no field "status"`, and on warm_leads
-- it would have failed on "lifecycle_status" -- regardless of which branch applies.
--
-- Every INSERT into prospect_clients therefore raised, which broke prospect imports
-- wholesale: process_prospect_import_batch caught the error per row and filed all of them
-- under status 'error', so a clean template import reported zero imported and every row
-- "recorded for review".
--
-- Fix: read each table's own column inside its own IF branch (the shape migration 047's
-- trigger already uses), so the reference is only ever compiled for the table that has it.

CREATE OR REPLACE FUNCTION public.prevent_existing_account_in_lead_lists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_owner_name TEXT;
  v_is_active BOOLEAN := false;
BEGIN
  IF TG_TABLE_NAME = 'prospect_clients' THEN
    v_is_active := NEW.lifecycle_status = 'active';
  ELSIF TG_TABLE_NAME = 'warm_leads' THEN
    v_is_active := NEW.status = 'active';
  END IF;

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

NOTIFY pgrst, 'reload schema';
