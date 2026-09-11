-- Two salespeople may work the same prospect. The pipeline treated a prospect as unique
-- across the whole CRM, so the second PIC to add a name got "duplicate" and no row --
-- their list simply never showed the lead, and the record they could see belonged to
-- someone else's silo.
--
-- The rule this implements:
--
--   * A prospect may exist once per PIC. Adding it to a list that already holds it is a
--     duplicate; adding it to a different PIC's list is normal business.
--   * An existing customer account is not a prospect for anybody. The PIC who won it owns
--     it, and nobody -- including that PIC -- puts it back into Prospects or Warm Leads.
--
-- Both paths in are covered: the import records a per-row reason naming the owner, and
-- manual entry refuses with the same sentence instead of a constraint message. The
-- trigger from migration 056 stays as the last line of defense for any other write path,
-- now phrased so the person reading it knows whose client it is.

CREATE OR REPLACE FUNCTION public.prevent_existing_account_in_lead_lists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_owner_name TEXT;
  v_company_name TEXT;
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

  SELECT company.account_owner_pic_id, company.name, pic.name
  INTO v_owner, v_company_name, v_owner_name
  FROM public.companies company
  LEFT JOIN public.pics pic ON pic.id = company.account_owner_pic_id
  WHERE company.id = NEW.company_id;

  IF v_owner IS NOT NULL THEN
    IF NEW.pic_id = v_owner THEN
      RAISE EXCEPTION '% is already your own active client, so it does not belong in Prospects or Warm Leads',
        COALESCE(v_company_name, 'This company')
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION '% is already an active client of %, so it cannot be added to another salesperson''s Prospects or Warm Leads',
      COALESCE(v_company_name, 'This company'), COALESCE(v_owner_name, 'another salesperson')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_existing_account_in_lead_lists() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_existing_account_in_lead_lists() TO service_role;

-- Manual entry gets the same two answers as the import, in the same words.
CREATE OR REPLACE FUNCTION public.create_manual_prospect(
    p_actor_id UUID,
    p_company_name TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_pic_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT 'Proceed',
    p_sms_deliverability TEXT DEFAULT NULL,
    p_industry TEXT DEFAULT NULL,
    p_service_location TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_state_province TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_date_added TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.prospect_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_prospect public.prospect_clients%ROWTYPE;
    v_email_norm TEXT := public.normalize_email(p_email);
    v_phone_norm TEXT := public.normalize_phone(p_phone);
    v_owner_pic_id UUID;
    v_owner_name TEXT;
    v_existing_id UUID;
BEGIN
    IF p_category NOT IN ('Proceed', 'Removed') THEN
        RAISE EXCEPTION 'Category must be Proceed or Removed' USING ERRCODE = 'P0001';
    END IF;

    SELECT o_company_id, o_contact_id INTO v_company_id, v_contact_id
    FROM public.find_or_create_company_contact(p_company_name, p_contact_person, p_phone, p_email, p_state_province, p_country);

    IF p_city IS NOT NULL AND NULLIF(btrim(p_city), '') IS NOT NULL THEN
        UPDATE public.companies SET address_city = btrim(p_city) WHERE id = v_company_id AND address_city IS NULL;
    END IF;
    IF p_industry IS NOT NULL AND NULLIF(btrim(p_industry), '') IS NOT NULL THEN
        UPDATE public.companies SET industry = btrim(p_industry) WHERE id = v_company_id AND industry IS NULL;
    END IF;

    IF public.is_pipeline_identity_removed(v_company_id, v_contact_id, p_email, NULL, p_phone, NULL) THEN
        RAISE EXCEPTION 'This company or contact is on the removed/suppression list' USING ERRCODE = 'P0001';
    END IF;

    -- Somebody's existing client is nobody's prospect.
    SELECT company.account_owner_pic_id, pic.name
    INTO v_owner_pic_id, v_owner_name
    FROM public.companies company
    LEFT JOIN public.pics pic ON pic.id = company.account_owner_pic_id
    WHERE company.id = v_company_id;

    IF v_owner_pic_id IS NOT NULL AND v_owner_pic_id IS DISTINCT FROM p_pic_id THEN
        RAISE EXCEPTION '% is already an active client of %. Existing accounts stay with the salesperson who won them, so it cannot be added as a prospect.',
            btrim(p_company_name), COALESCE(v_owner_name, 'another salesperson')
            USING ERRCODE = 'P0001';
    END IF;
    IF v_owner_pic_id IS NOT NULL THEN
        RAISE EXCEPTION '% is already your own active client. Work it from Existing Accounts rather than adding it back to Prospects.',
            btrim(p_company_name)
            USING ERRCODE = 'P0001';
    END IF;

    -- A duplicate only within this PIC's own list. The same prospect sitting in another
    -- salesperson's list is expected and must not block this one.
    SELECT prospect.id INTO v_existing_id
    FROM public.prospect_clients prospect
    WHERE prospect.company_id = v_company_id
      AND prospect.pic_id IS NOT DISTINCT FROM p_pic_id
      AND prospect.lifecycle_status = 'active'
      AND (
        (v_contact_id IS NOT NULL AND prospect.contact_id = v_contact_id)
        OR (v_contact_id IS NULL AND prospect.contact_id IS NULL)
      )
    ORDER BY prospect.created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND p_category <> 'Removed' THEN
        RAISE EXCEPTION '% is already in your prospect list.', btrim(p_company_name)
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.prospect_clients (
        company_id, contact_id, pic_id, category, lifecycle_status, source_data, created_at
    ) VALUES (
        v_company_id, v_contact_id, p_pic_id, p_category,
        CASE WHEN p_category = 'Removed' THEN 'removed' ELSE 'active' END,
        jsonb_build_object(
            'sms_deliverability', p_sms_deliverability,
            'service_locations', p_service_location,
            'manual_entry', true
        ),
        COALESCE(p_date_added, NOW())
    )
    RETURNING * INTO v_prospect;

    IF p_category = 'Removed' THEN
        IF v_email_norm IS NOT NULL THEN
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'email', v_email_norm, 'Marked Removed on manual entry', 'manual', p_actor_id)
            ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
        ELSIF v_phone_norm IS NOT NULL THEN
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, normalized_value, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'phone', v_phone_norm, 'Marked Removed on manual entry', 'manual', p_actor_id)
            ON CONFLICT (identity_type, normalized_value) WHERE normalized_value IS NOT NULL DO NOTHING;
        ELSE
            INSERT INTO public.removed_entries (company_id, contact_id, identity_type, reason, source, created_by)
            VALUES (v_company_id, v_contact_id, 'contact', 'Marked Removed on manual entry', 'manual', p_actor_id);
        END IF;
    END IF;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, actor_id, payload)
    VALUES ('prospect', v_prospect.id, 'prospect_created_manually', p_actor_id, jsonb_build_object('company_id', v_company_id, 'contact_id', v_contact_id));

    RETURN NEXT v_prospect;
END;
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
    v_same_name_company_id UUID;
    v_contact_id UUID;
    v_prospect_id UUID;
    v_actor_pic_id UUID;
    v_pic_id UUID;
    v_pic_name TEXT;
    v_owner_pic_id UUID;
    v_owner_name TEXT;
    v_match_count INTEGER;
    v_imported INTEGER := 0;
    v_without_contact INTEGER := 0;
    v_duplicates INTEGER := 0;
    v_removed INTEGER := 0;
    v_conflicts INTEGER := 0;
    v_skipped INTEGER := 0;
    v_errors INTEGER := 0;
    v_reason TEXT;
BEGIN
    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 5000 THEN
        RAISE EXCEPTION 'Import must contain between 1 and 5000 rows';
    END IF;

    SELECT id INTO v_actor_pic_id
    FROM public.pics
    WHERE profile_id = p_actor_id AND status = 'active'
    LIMIT 1;

    -- An import that cannot be attributed to a PIC would land in a list nobody queries.
    -- Refuse it outright instead of writing rows no one will ever see.
    IF v_actor_pic_id IS NULL THEN
        RAISE EXCEPTION 'Your account is not linked to an active PIC, so imported prospects would not appear in any list. Ask an admin to link your profile to a PIC first.'
            USING ERRCODE = 'P0001';
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
        v_same_name_company_id := NULL;
        v_owner_pic_id := NULL;
        v_owner_name := NULL;
        v_contact_id := NULL;
        v_prospect_id := NULL;
        v_reason := NULL;

        -- The sheet's PIC column wins when it names an active PIC; otherwise the row
        -- belongs to whoever ran the import.
        v_pic_name := NULLIF(btrim(v_row->>'pic'), '');
        v_pic_id := NULL;
        IF v_pic_name IS NOT NULL THEN
            SELECT id INTO v_pic_id
            FROM public.pics
            WHERE status = 'active'
              AND public.normalize_identity_text(name) = public.normalize_identity_text(v_pic_name)
            LIMIT 1;
        END IF;
        v_pic_id := COALESCE(v_pic_id, v_actor_pic_id);

        BEGIN
            -- Incomplete source data is skipped, not errored: there is nothing here for
            -- a person to act on, and mixing it into the review queue buries the rows
            -- that genuinely need attention.
            IF v_company_norm IS NULL THEN
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
                VALUES (v_batch_id, v_item.row_number, v_row, 'skipped', 'No company name in the source row');
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;
            IF v_email_1 IS NULL AND v_email_2 IS NULL AND v_phone_1 IS NULL AND v_phone_2 IS NULL THEN
                INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason)
                VALUES (v_batch_id, v_item.row_number, v_row, 'skipped', 'No email or phone in the source row');
                v_skipped := v_skipped + 1;
                CONTINUE;
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
                    -- Company identity is name plus country/state/city, so the same company
                    -- re-imported from a sheet that spells its address differently -- or omits
                    -- it -- matches nothing here. Before calling that a conflict, look at the
                    -- company this contact is already attached to: if it carries the same
                    -- normalized name, it IS this company, and the row is a duplicate rather
                    -- than a contradiction for someone to resolve by hand.
                    SELECT link.company_id INTO v_same_name_company_id
                    FROM public.company_contacts link
                    JOIN public.companies company ON company.id = link.company_id
                    WHERE link.contact_id = v_contact_id
                      AND company.name_normalized = v_company_norm
                    LIMIT 1;

                    IF v_same_name_company_id IS NOT NULL THEN
                        v_company_id := v_same_name_company_id;
                    ELSE
                        v_reason := 'Existing contact is linked to a different company identity';
                        INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id)
                        VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason, v_company_id, v_contact_id);
                        v_conflicts := v_conflicts + 1;
                        CONTINUE;
                    END IF;
                END IF;

                -- Scoped to this PIC on purpose: two salespeople may each carry the same
                -- prospect, and only re-adding it to the SAME list is a duplicate.
                SELECT id INTO v_prospect_id
                FROM public.prospect_clients
                WHERE company_id = v_company_id AND contact_id = v_contact_id AND pic_id = v_pic_id
                ORDER BY created_at DESC LIMIT 1;

                IF v_prospect_id IS NOT NULL THEN
                    v_reason := 'Already in this PIC''s prospect list';
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id, prospect_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'duplicate', v_reason, v_company_id, v_contact_id, v_prospect_id);
                    v_duplicates := v_duplicates + 1;
                    CONTINUE;
                END IF;
            ELSIF v_company_id IS NOT NULL THEN
                -- No contact identity to match on this row. Treat a second contact-less row
                -- for the same company as a duplicate instead of creating another
                -- contact-less prospect every time the sheet is re-imported.
                SELECT id INTO v_prospect_id
                FROM public.prospect_clients
                WHERE company_id = v_company_id AND contact_id IS NULL AND pic_id = v_pic_id
                ORDER BY created_at DESC LIMIT 1;

                IF v_prospect_id IS NOT NULL THEN
                    v_reason := 'Company already in this PIC''s prospect list, without a contact';
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, prospect_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'duplicate', v_reason, v_company_id, v_prospect_id);
                    v_duplicates := v_duplicates + 1;
                    CONTINUE;
                END IF;
            END IF;

            -- An existing customer account belongs to the PIC who won it. Report that by
            -- name instead of letting the insert trigger raise, so the row carries a reason
            -- a person can act on.
            IF v_company_id IS NOT NULL THEN
                SELECT company.account_owner_pic_id, pic.name
                INTO v_owner_pic_id, v_owner_name
                FROM public.companies company
                LEFT JOIN public.pics pic ON pic.id = company.account_owner_pic_id
                WHERE company.id = v_company_id;

                IF v_owner_pic_id IS NOT NULL AND v_owner_pic_id IS DISTINCT FROM v_pic_id THEN
                    v_reason := format('%s is already an active client of %s and cannot be added as a prospect',
                        v_company_name, COALESCE(v_owner_name, 'another salesperson'));
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason, v_company_id, v_contact_id);
                    v_conflicts := v_conflicts + 1;
                    CONTINUE;
                END IF;

                IF v_owner_pic_id IS NOT NULL THEN
                    v_reason := format('%s is already your own active client, so it does not belong in Prospects',
                        v_company_name);
                    INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, reason, company_id, contact_id)
                    VALUES (v_batch_id, v_item.row_number, v_row, 'conflict', v_reason, v_company_id, v_contact_id);
                    v_conflicts := v_conflicts + 1;
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
                VALUES (v_company_id, v_contact_id, true)
                ON CONFLICT (company_id, contact_id) DO NOTHING;
            END IF;

            INSERT INTO public.prospect_clients (company_id, contact_id, pic_id, category, lifecycle_status, source_data)
            VALUES (
                v_company_id, v_contact_id, v_pic_id,
                COALESCE(NULLIF(btrim(v_row->>'category'), ''), 'Proceed'), 'active',
                v_row || jsonb_build_object('contact_missing', v_contact_id IS NULL)
            )
            RETURNING id INTO v_prospect_id;

            INSERT INTO public.import_rows (batch_id, row_number, raw_data, status, company_id, contact_id, prospect_id)
            VALUES (v_batch_id, v_item.row_number, v_row, 'imported', v_company_id, v_contact_id, v_prospect_id);
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
        removed_rows = v_removed, conflict_rows = v_conflicts, skipped_rows = v_skipped,
        error_rows = v_errors, completed_at = NOW()
    WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'batchId', v_batch_id, 'totalCount', jsonb_array_length(p_rows), 'importedCount', v_imported,
        'withoutContactCount', v_without_contact,
        'duplicateCount', v_duplicates, 'removedCount', v_removed, 'conflictCount', v_conflicts,
        'skippedCount', v_skipped, 'errorCount', v_errors
    );
END;
$$;



NOTIFY pgrst, 'reload schema';
