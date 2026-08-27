CREATE OR REPLACE FUNCTION public.get_pic_id(p_profile_id UUID) RETURNS UUID AS $$
DECLARE
    v_pic_id UUID;
BEGIN
    SELECT id INTO v_pic_id FROM public.pics WHERE profile_id = p_profile_id AND status = 'active' LIMIT 1;
    RETURN v_pic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration 014 made a named contact optional on import, but its duplicate check only ran
-- when a contact was matched (IF v_contact_id IS NOT NULL). A row with a company name and no
-- contact identity to match on skipped that check entirely, so re-importing the same
-- contact-less row (a realistic case: the team pastes/imports the same working sheet more
-- than once) created a second prospect_clients row for the same company every time instead
-- of being flagged as a duplicate.

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
    v_without_contact INTEGER := 0;
    v_duplicates INTEGER := 0;
    v_removed INTEGER := 0;
    v_conflicts INTEGER := 0;
    v_errors INTEGER := 0;
    v_reason TEXT;
    v_pic_id UUID;
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
            IF v_company_norm IS NULL THEN
                RAISE EXCEPTION 'Missing company name' USING ERRCODE = 'P0001';
            END IF;
            IF v_email_1 IS NULL AND v_email_2 IS NULL AND v_phone_1 IS NULL AND v_phone_2 IS NULL THEN
                RAISE EXCEPTION 'At least one email or phone is required' USING ERRCODE = 'P0001';
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

            IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, v_pic_id, v_email_1, v_email_2, v_phone_1, v_phone_2) THEN
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
                    VALUES (v_batch_id, v_item.row_number, v_row, 'duplicate', v_reason, v_company_id, v_contact_id, v_pic_id, v_prospect_id);
                    v_duplicates := v_duplicates + 1;
                    CONTINUE;
                END IF;
            ELSIF v_company_id IS NOT NULL THEN
                -- No contact identity to match on this row. Treat a second contact-less row
                -- for the same company as a duplicate instead of creating another
                -- contact-less prospect every time the sheet is re-imported.
                SELECT id INTO v_prospect_id
                FROM public.prospect_clients
                WHERE company_id = v_company_id AND contact_id IS NULL
                ORDER BY created_at DESC LIMIT 1;

                IF v_prospect_id IS NOT NULL THEN
                    v_reason := 'Company already exists in the pipeline without a contact';
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, prospect_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'duplicate', v_reason, v_company_id, v_prospect_id);
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

            -- No named contact on this row and no existing contact matched by email/phone:
            -- create the company on its own rather than a fake "Unknown Contact".
            IF v_contact_id IS NULL AND v_contact_name IS NOT NULL THEN
                v_first_name := split_part(v_contact_name, ' ', 1);
                v_last_name := NULLIF(btrim(substr(v_contact_name, length(v_first_name) + 1)), '');
                INSERT INTO public.contacts (first_name, last_name, phone_direct, phone_2, email_active, email_2)
                VALUES (
                    v_first_name, v_last_name, NULLIF(btrim(v_row->>'contact_number_direct'), ''),
                    NULLIF(btrim(v_row->>'contact_number_2'), ''), NULLIF(btrim(v_row->>'email_active'), ''), NULLIF(btrim(v_row->>'email_2'), '')
                ) RETURNING id INTO v_contact_id;
            END IF;

            IF v_contact_id IS NOT NULL THEN
                INSERT INTO public.company_contacts (company_id, contact_id, is_primary)
                VALUES (v_company_id, v_contact_id, v_pic_id, true)
                ON CONFLICT (company_id, contact_id) DO NOTHING;
            END IF;

            v_pic_id := public.get_pic_id(p_actor_id);
            INSERT INTO public.prospect_clients (company_id, contact_id, pic_id, category, lifecycle_status, source_data)
            VALUES (
                v_company_id, v_contact_id, v_pic_id,
                COALESCE(NULLIF(btrim(v_row->>'category'), ''), 'Proceed'), 'active',
                v_row || jsonb_build_object('contact_missing', v_contact_id IS NULL)
            )
            RETURNING id INTO v_prospect_id;

            INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, company_id, contact_id, prospect_id)
            VALUES (v_batch_id, v_item.row_number, v_row, 'imported', v_company_id, v_contact_id, v_pic_id, v_prospect_id);
            v_imported := v_imported + 1;
            IF v_contact_id IS NULL THEN
                v_without_contact := v_without_contact + 1;
            END IF;
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
        'withoutContactCount', v_without_contact,
        'duplicateCount', v_duplicates, 'removedCount', v_removed, 'conflictCount', v_conflicts, 'errorCount', v_errors
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Apply RLS to the pipeline tables
-- RLS Policy: Users can only select/insert/update rows where pic_id matches their own OR they are an admin.

-- 1. Helper function for RLS
CREATE OR REPLACE FUNCTION public.user_has_pipeline_access(p_pic_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
    v_user_pic_id UUID;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    SELECT id INTO v_user_pic_id FROM public.pics WHERE profile_id = auth.uid() AND status = 'active' LIMIT 1;
    RETURN p_pic_id = v_user_pic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing (if any) and Create Policies
DROP POLICY IF EXISTS "Pipeline access" ON public.prospect_clients;
CREATE POLICY "Pipeline access" ON public.prospect_clients
    FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id));

DROP POLICY IF EXISTS "Pipeline access" ON public.warm_leads;
CREATE POLICY "Pipeline access" ON public.warm_leads
    FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id));

DROP POLICY IF EXISTS "Pipeline access" ON public.inquiries;
CREATE POLICY "Pipeline access" ON public.inquiries
    FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id));

DROP POLICY IF EXISTS "Pipeline access" ON public.quotations;
CREATE POLICY "Pipeline access" ON public.quotations
    FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id));

DROP POLICY IF EXISTS "Pipeline access" ON public.sales;
CREATE POLICY "Pipeline access" ON public.sales
    FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id));

NOTIFY pgrst, 'reload schema';
