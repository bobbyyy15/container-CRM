-- 043_identity_first_client_matching.sql
--
-- Fixes the duplicate-client bug.
--
-- find_or_create_company_contact resolved the COMPANY first, by name. A manual entry
-- for someone already on file but with the company typed differently ("Jeremy" vs
-- "Affordable Containers") therefore created a brand-new company, found the existing
-- contact by email/phone, and linked that one contact to the new company as primary.
-- Repeat that and a single person accumulates several "primary" companies and a
-- duplicate row in every pipeline list. Observed live: one contact linked to three
-- companies, with two warm leads for the same phone and email.
--
-- The identity (email/phone) is what actually identifies a client, so resolution now
-- starts there: if the contact is already known, reuse the company they are already
-- attached to instead of creating a parallel one. The typed company name is only used
-- when the contact is genuinely new, or when they have no company yet.
--
-- Note the deliberate trade-off: once a client is on file, a differently-typed company
-- name is ignored rather than creating a second record. Renaming the company is a
-- separate, explicit action -- which is the right way round, because silently
-- splitting a client in two is much harder to notice and undo.

CREATE OR REPLACE FUNCTION public.find_or_create_company_contact(
    p_company_name TEXT,
    p_contact_person TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_state_province TEXT,
    p_country TEXT,
    OUT o_company_id UUID,
    OUT o_contact_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_norm TEXT := public.normalize_identity_text(p_company_name);
    v_phone_norm TEXT := public.normalize_phone(p_phone);
    v_email_norm TEXT := public.normalize_email(p_email);
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    -- 1. Identity first: is this person already on file?
    IF v_email_norm IS NOT NULL OR v_phone_norm IS NOT NULL THEN
        SELECT id INTO o_contact_id
        FROM public.contacts
        WHERE (v_email_norm IS NOT NULL AND v_email_norm IN (email_active_normalized, email_2_normalized))
           OR (v_phone_norm IS NOT NULL AND v_phone_norm IN (phone_direct_normalized, phone_2_normalized))
        LIMIT 1;
    END IF;

    -- 2. A known contact keeps the company they already belong to.
    IF o_contact_id IS NOT NULL THEN
        SELECT cc.company_id INTO o_company_id
        FROM public.company_contacts cc
        WHERE cc.contact_id = o_contact_id
        ORDER BY cc.is_primary DESC, cc.company_id
        LIMIT 1;
    END IF;

    -- 3. Otherwise fall back to matching (or creating) the company by name.
    IF o_company_id IS NULL THEN
        IF v_company_norm IS NULL THEN
            RAISE EXCEPTION 'Company name is required' USING ERRCODE = 'P0001';
        END IF;

        SELECT id INTO o_company_id
        FROM public.companies
        WHERE name_normalized = v_company_norm
          AND public.normalize_identity_text(address_state) IS NOT DISTINCT FROM public.normalize_identity_text(p_state_province)
          AND public.normalize_identity_text(address_country) IS NOT DISTINCT FROM public.normalize_identity_text(p_country)
        LIMIT 1;

        IF o_company_id IS NULL THEN
            INSERT INTO public.companies (name, address_state, address_country)
            VALUES (btrim(p_company_name), NULLIF(btrim(p_state_province), ''), NULLIF(btrim(p_country), ''))
            RETURNING id INTO o_company_id;
        END IF;
    END IF;

    IF o_contact_id IS NULL AND NULLIF(btrim(p_contact_person), '') IS NOT NULL THEN
        v_first_name := split_part(btrim(p_contact_person), ' ', 1);
        v_last_name := NULLIF(btrim(substr(btrim(p_contact_person), length(v_first_name) + 1)), '');
        INSERT INTO public.contacts (first_name, last_name, phone_direct, email_active)
        VALUES (v_first_name, v_last_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_email), ''))
        RETURNING id INTO o_contact_id;
    END IF;

    IF o_contact_id IS NOT NULL THEN
        INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
        VALUES (o_company_id, o_contact_id, true)
        ON CONFLICT (company_id, contact_id) DO NOTHING;
    END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- Collapse the duplicates already created by the old behaviour
-- ───────────────────────────────────────────────────────────────────────────────
-- Keeps the earliest pipeline row per contact and deletes the rest, per the rule
-- "when there are many duplicates, one survives". Rows whose contact is unknown are
-- left alone -- without an identity there is nothing to match them on.
CREATE OR REPLACE FUNCTION public.dedupe_pipeline_by_contact(p_pic_id UUID DEFAULT NULL)
RETURNS TABLE (stage TEXT, deleted INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_prospects INTEGER;
    v_warm INTEGER;
BEGIN
    WITH ranked AS (
        SELECT id, row_number() OVER (PARTITION BY contact_id, pic_id ORDER BY created_at, id) AS rn
        FROM public.prospect_clients
        WHERE lifecycle_status = 'active' AND contact_id IS NOT NULL
          AND (p_pic_id IS NULL OR pic_id = p_pic_id)
    ), gone AS (
        DELETE FROM public.prospect_clients WHERE id IN (SELECT id FROM ranked WHERE rn > 1) RETURNING 1
    ) SELECT count(*)::int INTO v_prospects FROM gone;

    WITH ranked AS (
        SELECT id, row_number() OVER (PARTITION BY contact_id, pic_id ORDER BY created_at, id) AS rn
        FROM public.warm_leads
        WHERE status = 'active' AND contact_id IS NOT NULL
          AND (p_pic_id IS NULL OR pic_id = p_pic_id)
    ), gone AS (
        DELETE FROM public.warm_leads WHERE id IN (SELECT id FROM ranked WHERE rn > 1) RETURNING 1
    ) SELECT count(*)::int INTO v_warm FROM gone;

    stage := 'prospect_clients'; deleted := v_prospects; RETURN NEXT;
    stage := 'warm_leads';       deleted := v_warm;      RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_pipeline_by_contact(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedupe_pipeline_by_contact(UUID) TO service_role;

-- One contact should have at most one primary company. The old path marked every
-- newly-created company primary, so demote all but the earliest link.
UPDATE public.company_contacts cc
SET is_primary = false
WHERE cc.is_primary = true
  AND EXISTS (
      SELECT 1 FROM public.company_contacts other
      WHERE other.contact_id = cc.contact_id
        AND other.is_primary = true
        AND (other.company_id, other.contact_id) <> (cc.company_id, cc.contact_id)
        AND other.ctid < cc.ctid
  );

NOTIFY pgrst, 'reload schema';
