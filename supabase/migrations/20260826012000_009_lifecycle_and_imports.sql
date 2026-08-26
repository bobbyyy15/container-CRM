-- CRM lifecycle, suppression, and atomic bulk prospect import.

CREATE OR REPLACE FUNCTION public.normalize_identity_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT NULLIF(lower(regexp_replace(btrim(COALESCE(p_value, '')), '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_email(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT NULLIF(lower(btrim(COALESCE(p_value, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT NULLIF(regexp_replace(COALESCE(p_value, ''), '[^0-9]+', '', 'g'), '');
$$;

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS name_normalized TEXT;

UPDATE public.companies
SET name_normalized = public.normalize_identity_text(name)
WHERE name_normalized IS DISTINCT FROM public.normalize_identity_text(name);

ALTER TABLE public.companies
    ALTER COLUMN name_normalized SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_company_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.name_normalized := public.normalize_identity_text(NEW.name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_normalized_name ON public.companies;
CREATE TRIGGER set_company_normalized_name
BEFORE INSERT OR UPDATE OF name ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_company_normalized_name();

UPDATE public.contacts SET
    email_active_normalized = public.normalize_email(email_active),
    email_2_normalized = public.normalize_email(email_2),
    phone_direct_normalized = public.normalize_phone(phone_direct),
    phone_2_normalized = public.normalize_phone(phone_2);

CREATE OR REPLACE FUNCTION public.set_contact_normalized_channels()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.email_active_normalized := public.normalize_email(NEW.email_active);
    NEW.email_2_normalized := public.normalize_email(NEW.email_2);
    NEW.phone_direct_normalized := public.normalize_phone(NEW.phone_direct);
    NEW.phone_2_normalized := public.normalize_phone(NEW.phone_2);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_contact_normalized_channels ON public.contacts;
CREATE TRIGGER set_contact_normalized_channels
BEFORE INSERT OR UPDATE OF email_active, email_2, phone_direct, phone_2 ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.set_contact_normalized_channels();

CREATE INDEX IF NOT EXISTS companies_normalized_identity_idx
    ON public.companies (
        name_normalized,
        public.normalize_identity_text(address_country),
        public.normalize_identity_text(address_state),
        public.normalize_identity_text(address_city)
    );
CREATE INDEX IF NOT EXISTS contacts_email_active_normalized_idx ON public.contacts (email_active_normalized) WHERE email_active_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_email_2_normalized_idx ON public.contacts (email_2_normalized) WHERE email_2_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_phone_direct_normalized_idx ON public.contacts (phone_direct_normalized) WHERE phone_direct_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_phone_2_normalized_idx ON public.contacts (phone_2_normalized) WHERE phone_2_normalized IS NOT NULL;

ALTER TABLE public.prospect_clients
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

ALTER TABLE public.warm_leads
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

UPDATE public.prospect_clients p SET
    lifecycle_status = 'converted',
    converted_at = COALESCE(p.converted_at, w.created_at)
FROM public.warm_leads w
WHERE w.source_prospect_id = p.id;

UPDATE public.warm_leads w SET
    status = 'converted',
    converted_at = COALESCE(w.converted_at, i.created_at)
FROM public.inquiries i
WHERE i.source_warm_lead_id = w.id;

UPDATE public.warm_leads SET status = 'active'
WHERE status NOT IN ('converted', 'removed', 'closed');
ALTER TABLE public.warm_leads ALTER COLUMN status SET DEFAULT 'active';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_clients_lifecycle_status_check') THEN
        ALTER TABLE public.prospect_clients ADD CONSTRAINT prospect_clients_lifecycle_status_check
            CHECK (lifecycle_status IN ('active', 'converted', 'removed', 'inactive'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warm_leads_status_check') THEN
        ALTER TABLE public.warm_leads ADD CONSTRAINT warm_leads_status_check
            CHECK (status IN ('active', 'converted', 'removed', 'closed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS prospect_clients_active_idx
    ON public.prospect_clients (created_at DESC) WHERE lifecycle_status = 'active';
CREATE INDEX IF NOT EXISTS warm_leads_active_idx
    ON public.warm_leads (created_at DESC) WHERE status = 'active';

CREATE TABLE public.removed_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    identity_type TEXT NOT NULL CHECK (identity_type IN ('company', 'contact', 'email', 'phone')),
    normalized_value TEXT,
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL OR normalized_value IS NOT NULL)
);

CREATE UNIQUE INDEX removed_entries_identity_unique_idx
    ON public.removed_entries (identity_type, normalized_value)
    WHERE normalized_value IS NOT NULL;
CREATE INDEX removed_entries_company_idx ON public.removed_entries (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX removed_entries_contact_idx ON public.removed_entries (contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    removed_rows INTEGER NOT NULL DEFAULT 0,
    conflict_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE public.import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_data JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('imported', 'duplicate', 'removed', 'conflict', 'error')),
    reason TEXT,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    prospect_id UUID REFERENCES public.prospect_clients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, row_number)
);

ALTER TABLE public.removed_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.removed_entries, public.import_batches, public.import_rows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_pipeline_identity_removed(
    p_company_id UUID,
    p_contact_id UUID,
    p_email_1 TEXT DEFAULT NULL,
    p_email_2 TEXT DEFAULT NULL,
    p_phone_1 TEXT DEFAULT NULL,
    p_phone_2 TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.removed_entries r
        WHERE r.company_id = p_company_id
           OR r.contact_id = p_contact_id
           OR (r.identity_type = 'email' AND r.normalized_value IN (
                public.normalize_email(p_email_1), public.normalize_email(p_email_2)
           ))
           OR (r.identity_type = 'phone' AND r.normalized_value IN (
                public.normalize_phone(p_phone_1), public.normalize_phone(p_phone_2)
           ))
    );
$$;

CREATE OR REPLACE FUNCTION public.process_prospect_import_batch(
    p_rows JSONB,
    p_actor_id UUID,
    p_batch_id UUID DEFAULT NULL,
    p_filename TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id UUID := COALESCE(p_batch_id, gen_random_uuid());
    v_item RECORD;
    v_row JSONB;
    v_company_name TEXT;
    v_company_norm TEXT;
    v_contact_name TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
    v_email_1 TEXT;
    v_email_2 TEXT;
    v_phone_1 TEXT;
    v_phone_2 TEXT;
    v_company_id UUID;
    v_contact_id UUID;
    v_prospect_id UUID;
    v_match_count INTEGER;
    v_imported INTEGER := 0;
    v_duplicates INTEGER := 0;
    v_removed INTEGER := 0;
    v_conflicts INTEGER := 0;
    v_errors INTEGER := 0;
    v_reason TEXT;
BEGIN
    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 5000 THEN
        RAISE EXCEPTION 'Import must contain between 1 and 5000 rows';
    END IF;

    -- Serialize prospect imports so two simultaneous batches cannot race past duplicate checks.
    PERFORM pg_advisory_xact_lock(20260826012000);

    INSERT INTO public.import_batches (id, filename, total_rows, created_by)
    VALUES (v_batch_id, NULLIF(btrim(p_filename), ''), jsonb_array_length(p_rows), p_actor_id);

    FOR v_item IN SELECT value, ordinality::INTEGER AS row_number FROM jsonb_array_elements(p_rows) WITH ORDINALITY
    LOOP
        v_row := v_item.value;
        v_company_name := NULLIF(btrim(v_row->>'company_name'), '');
        v_company_norm := public.normalize_identity_text(v_company_name);
        v_contact_name := NULLIF(btrim(v_row->>'contact_person'), '');
        v_email_1 := public.normalize_email(v_row->>'email_active');
        v_email_2 := public.normalize_email(v_row->>'email_2');
        v_phone_1 := public.normalize_phone(v_row->>'contact_number_direct');
        v_phone_2 := public.normalize_phone(v_row->>'contact_number_2');
        v_company_id := NULL;
        v_contact_id := NULL;
        v_prospect_id := NULL;
        v_reason := NULL;

        BEGIN
            IF v_company_norm IS NULL OR v_contact_name IS NULL OR (v_email_1 IS NULL AND v_email_2 IS NULL AND v_phone_1 IS NULL AND v_phone_2 IS NULL) THEN
                RAISE EXCEPTION 'Company, contact name, and at least one email or phone are required';
            END IF;

            IF lower(COALESCE(btrim(v_row->>'category'), '')) = 'removed' THEN
                IF v_email_1 IS NOT NULL THEN
                    INSERT INTO public.removed_entries (identity_type, normalized_value, reason, source, created_by)
                    VALUES ('email', v_email_1, 'Marked Removed in import', 'import', p_actor_id)
                    ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
                ELSIF v_email_2 IS NOT NULL THEN
                    INSERT INTO public.removed_entries (identity_type, normalized_value, reason, source, created_by)
                    VALUES ('email', v_email_2, 'Marked Removed in import', 'import', p_actor_id)
                    ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
                ELSE
                    INSERT INTO public.removed_entries (identity_type, normalized_value, reason, source, created_by)
                    VALUES ('phone', COALESCE(v_phone_1, v_phone_2), 'Marked Removed in import', 'import', p_actor_id)
                    ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
                END IF;
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
                VALUES (v_batch_id, v_item.row_number, v_row, 'removed', 'Marked Removed in source sheet');
                v_removed := v_removed + 1;
                CONTINUE;
            END IF;

            SELECT count(*), (array_agg(id))[1] INTO v_match_count, v_company_id
            FROM public.companies
            WHERE name_normalized = v_company_norm
              AND public.normalize_identity_text(address_country) IS NOT DISTINCT FROM public.normalize_identity_text(v_row->>'country')
              AND public.normalize_identity_text(address_state) IS NOT DISTINCT FROM public.normalize_identity_text(v_row->>'state_province')
              AND public.normalize_identity_text(address_city) IS NOT DISTINCT FROM public.normalize_identity_text(v_row->>'city');

            IF v_match_count > 1 THEN
                v_reason := 'Multiple companies match the same normalized identity';
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
                VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason);
                v_conflicts := v_conflicts + 1;
                CONTINUE;
            END IF;

            SELECT count(DISTINCT id), (array_agg(DISTINCT id))[1] INTO v_match_count, v_contact_id
            FROM public.contacts
            WHERE (v_email_1 IS NOT NULL AND v_email_1 IN (email_active_normalized, email_2_normalized))
               OR (v_email_2 IS NOT NULL AND v_email_2 IN (email_active_normalized, email_2_normalized))
               OR (v_phone_1 IS NOT NULL AND v_phone_1 IN (phone_direct_normalized, phone_2_normalized))
               OR (v_phone_2 IS NOT NULL AND v_phone_2 IN (phone_direct_normalized, phone_2_normalized));

            IF v_match_count > 1 THEN
                v_reason := 'Email or phone matches more than one contact';
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
                VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason);
                v_conflicts := v_conflicts + 1;
                CONTINUE;
            END IF;

            IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, v_email_1, v_email_2, v_phone_1, v_phone_2) THEN
                v_reason := 'Identity is on the removed/suppression list';
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id)
                VALUES (v_batch_id, v_item.row_number, v_row, 'removed', v_reason, v_company_id, v_contact_id);
                v_removed := v_removed + 1;
                CONTINUE;
            END IF;

            IF v_contact_id IS NOT NULL THEN
                IF v_company_id IS NULL OR NOT EXISTS (
                    SELECT 1 FROM public.company_contacts
                    WHERE company_id = v_company_id AND contact_id = v_contact_id
                ) THEN
                    v_reason := 'Existing contact is linked to a different company identity';
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason, v_company_id, v_contact_id);
                    v_conflicts := v_conflicts + 1;
                    CONTINUE;
                END IF;

                SELECT id INTO v_prospect_id
                FROM public.prospect_clients
                WHERE company_id = v_company_id AND contact_id = v_contact_id
                ORDER BY created_at DESC LIMIT 1;

                IF v_prospect_id IS NOT NULL THEN
                    v_reason := 'Contact already exists in the pipeline';
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id, prospect_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'duplicate', v_reason, v_company_id, v_contact_id, v_prospect_id);
                    v_duplicates := v_duplicates + 1;
                    CONTINUE;
                END IF;
            END IF;

            IF v_company_id IS NULL THEN
                INSERT INTO public.companies (name, industry, address_street, address_city, address_state, address_country)
                VALUES (
                    v_company_name, NULLIF(btrim(v_row->>'industry'), ''), NULLIF(btrim(v_row->>'address'), ''),
                    NULLIF(btrim(v_row->>'city'), ''), NULLIF(btrim(v_row->>'state_province'), ''), NULLIF(btrim(v_row->>'country'), '')
                ) RETURNING id INTO v_company_id;
            END IF;

            IF v_contact_id IS NULL THEN
                v_first_name := split_part(v_contact_name, ' ', 1);
                v_last_name := NULLIF(btrim(substr(v_contact_name, length(v_first_name) + 1)), '');
                INSERT INTO public.contacts (first_name, last_name, phone_direct, phone_2, email_active, email_2)
                VALUES (
                    v_first_name, v_last_name, NULLIF(btrim(v_row->>'contact_number_direct'), ''),
                    NULLIF(btrim(v_row->>'contact_number_2'), ''), NULLIF(btrim(v_row->>'email_active'), ''), NULLIF(btrim(v_row->>'email_2'), '')
                ) RETURNING id INTO v_contact_id;
            END IF;

            INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
            VALUES (v_company_id, v_contact_id, true)
            ON CONFLICT (company_id, contact_id) DO NOTHING;

            INSERT INTO public.prospect_clients (company_id, contact_id, category, lifecycle_status, source_data)
            VALUES (v_company_id, v_contact_id, COALESCE(NULLIF(btrim(v_row->>'category'), ''), 'Proceed'), 'active', v_row)
            RETURNING id INTO v_prospect_id;

            INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, company_id, contact_id, prospect_id)
            VALUES (v_batch_id, v_item.row_number, v_row, 'imported', v_company_id, v_contact_id, v_prospect_id);
            v_imported := v_imported + 1;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
            VALUES (v_batch_id, v_item.row_number, v_row, 'error', SQLERRM);
            v_errors := v_errors + 1;
        END;
    END LOOP;

    UPDATE public.import_batches SET
        status = 'completed', imported_rows = v_imported, duplicate_rows = v_duplicates,
        removed_rows = v_removed, conflict_rows = v_conflicts, error_rows = v_errors,
        completed_at = NOW()
    WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'batchId', v_batch_id, 'totalCount', jsonb_array_length(p_rows), 'importedCount', v_imported,
        'duplicateCount', v_duplicates, 'removedCount', v_removed, 'conflictCount', v_conflicts, 'errorCount', v_errors
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_pipeline_entry(
    p_stage TEXT,
    p_entity_id UUID,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS public.removed_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_removed public.removed_entries%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A removal reason is required';
    END IF;

    IF p_stage = 'prospect' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.prospect_clients WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.prospect_clients SET lifecycle_status = 'removed', removed_at = NOW() WHERE id = p_entity_id;
    ELSIF p_stage = 'warm_lead' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.warm_leads WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.warm_leads SET status = 'removed', removed_at = NOW() WHERE id = p_entity_id;
    ELSIF p_stage = 'inquiry' THEN
        SELECT company_id, contact_id INTO v_company_id, v_contact_id
        FROM public.inquiries WHERE id = p_entity_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.inquiries SET status = 'Removed' WHERE id = p_entity_id;
    ELSE
        RAISE EXCEPTION 'Unsupported pipeline stage';
    END IF;

    INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
    VALUES (v_company_id, v_contact_id, 'contact', btrim(p_reason), p_stage, p_actor_id)
    RETURNING * INTO v_removed;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES (p_stage, p_entity_id, 'removed', p_actor_id, jsonb_build_object('reason', btrim(p_reason), 'removed_entry_id', v_removed.id));
    RETURN v_removed;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_prospect_to_warm_lead(p_prospect_id UUID, p_actor_id UUID)
RETURNS SETOF public.warm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prospect public.prospect_clients%ROWTYPE;
    v_contact public.contacts%ROWTYPE;
    v_warm_lead public.warm_leads%ROWTYPE;
BEGIN
    SELECT * INTO v_prospect FROM public.prospect_clients WHERE id = p_prospect_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_warm_lead FROM public.warm_leads WHERE source_prospect_id = p_prospect_id;
    IF FOUND THEN RETURN NEXT v_warm_lead; RETURN; END IF;

    IF v_prospect.lifecycle_status <> 'active' OR v_prospect.category <> 'Proceed' THEN
        RAISE EXCEPTION 'Prospect is not eligible for conversion' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_contact FROM public.contacts WHERE id = v_prospect.contact_id;
    IF public.is_pipeline_identity_removed(v_prospect.company_id, v_prospect.contact_id, v_contact.email_active, v_contact.email_2, v_contact.phone_direct, v_contact.phone_2) THEN
        RAISE EXCEPTION 'Prospect is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.warm_leads (source_prospect_id, company_id, contact_id, pic_id, status)
    VALUES (v_prospect.id, v_prospect.company_id, v_prospect.contact_id, v_prospect.pic_id, 'active')
    RETURNING * INTO v_warm_lead;

    UPDATE public.prospect_clients SET lifecycle_status = 'converted', converted_at = NOW() WHERE id = v_prospect.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('prospect', v_prospect.id, 'converted_to_warm_lead', p_actor_id, jsonb_build_object('warm_lead_id', v_warm_lead.id));
    RETURN NEXT v_warm_lead;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inquiry_from_warm_lead(p_warm_lead_id UUID, p_actor_id UUID, p_requirements TEXT DEFAULT NULL)
RETURNS SETOF public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_warm_lead public.warm_leads%ROWTYPE;
    v_contact public.contacts%ROWTYPE;
    v_inquiry public.inquiries%ROWTYPE;
BEGIN
    SELECT * INTO v_warm_lead FROM public.warm_leads WHERE id = p_warm_lead_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Warm lead not found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_inquiry FROM public.inquiries WHERE source_warm_lead_id = p_warm_lead_id;
    IF FOUND THEN RETURN NEXT v_inquiry; RETURN; END IF;

    IF v_warm_lead.status <> 'active' THEN
        RAISE EXCEPTION 'Warm lead is not eligible for an inquiry' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_contact FROM public.contacts WHERE id = v_warm_lead.contact_id;
    IF public.is_pipeline_identity_removed(v_warm_lead.company_id, v_warm_lead.contact_id, v_contact.email_active, v_contact.email_2, v_contact.phone_direct, v_contact.phone_2) THEN
        RAISE EXCEPTION 'Warm lead is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.inquiries (source_warm_lead_id, company_id, contact_id, pic_id, requirements, status)
    VALUES (v_warm_lead.id, v_warm_lead.company_id, v_warm_lead.contact_id, v_warm_lead.pic_id, p_requirements, 'Under Review')
    RETURNING * INTO v_inquiry;

    UPDATE public.warm_leads SET status = 'converted', converted_at = NOW() WHERE id = v_warm_lead.id;
    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('warm_lead', v_warm_lead.id, 'inquiry_created', p_actor_id, jsonb_build_object('inquiry_id', v_inquiry.id));
    RETURN NEXT v_inquiry;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_identity_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_phone(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_pipeline_identity_removed(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_prospect_import_batch(JSONB, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_prospect_import_batch(JSONB, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_pipeline_entry(TEXT, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_warm_lead(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_inquiry_from_warm_lead(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
