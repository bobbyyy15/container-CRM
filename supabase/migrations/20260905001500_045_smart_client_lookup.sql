-- 045_smart_client_lookup.sql
--
-- Enhanced client auto-lookup supporting:
-- 1. Exact or partial email matching (email_active, email_2, normalized)
-- 2. Exact or substring phone matching (direct phone, phone_2, normalized digits)
-- 3. Contact person name matching (first name, last name, full name)
-- 4. Company name matching (normalized name or name ILIKE)
--
-- Robustly resolves the associated company (prioritizing primary company link,
-- then any link, then pipeline stages) and assigns the owning PIC.

CREATE OR REPLACE FUNCTION public.lookup_client_by_identity(p_identity TEXT)
RETURNS TABLE (
    company_id      UUID,
    company_name    TEXT,
    contact_id      UUID,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    state_province  TEXT,
    country         TEXT,
    pic_id          UUID,
    pic_name        TEXT,
    stage           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_raw        TEXT := btrim(COALESCE(p_identity, ''));
    v_email_norm TEXT;
    v_phone_norm TEXT;
    v_name_norm  TEXT;
BEGIN
    IF v_raw = '' THEN RETURN; END IF;

    IF v_raw LIKE '%@%' THEN
        v_email_norm := public.normalize_email(v_raw);
    END IF;

    v_phone_norm := public.normalize_phone(v_raw);
    v_name_norm  := public.normalize_identity_text(v_raw);

    RETURN QUERY
    WITH candidate_matches AS (
        -- 1. Email matching (highest priority)
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            1 AS priority
        FROM public.contacts co
        WHERE (v_email_norm IS NOT NULL AND (
            co.email_active_normalized = v_email_norm
            OR co.email_2_normalized = v_email_norm
            OR co.email_active ILIKE v_raw
            OR co.email_2 ILIKE v_raw
        ))
        UNION ALL
        -- 2. Phone matching
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            2 AS priority
        FROM public.contacts co
        WHERE (v_phone_norm IS NOT NULL AND length(v_phone_norm) >= 4 AND (
            co.phone_direct_normalized = v_phone_norm
            OR co.phone_2_normalized = v_phone_norm
            OR (length(v_phone_norm) >= 7 AND (
                co.phone_direct_normalized LIKE '%' || v_phone_norm || '%'
                OR v_phone_norm LIKE '%' || co.phone_direct_normalized || '%'
                OR co.phone_2_normalized LIKE '%' || v_phone_norm || '%'
                OR v_phone_norm LIKE '%' || co.phone_2_normalized || '%'
            ))
        ))
        UNION ALL
        -- 3. Contact person name matching
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            3 AS priority
        FROM public.contacts co
        WHERE (v_name_norm IS NOT NULL AND length(v_raw) >= 3 AND (
            co.first_name || ' ' || COALESCE(co.last_name, '') ILIKE '%' || v_raw || '%'
            OR co.first_name ILIKE '%' || v_raw || '%'
            OR co.last_name ILIKE '%' || v_raw || '%'
        ))
        UNION ALL
        -- 4. Company name matching
        SELECT
            cc.contact_id AS match_contact_id,
            c.id AS match_company_id,
            4 AS priority
        FROM public.companies c
        LEFT JOIN public.company_contacts cc ON cc.company_id = c.id AND cc.is_primary = true
        WHERE (v_name_norm IS NOT NULL AND length(v_raw) >= 3 AND (
            c.name_normalized = v_name_norm
            OR c.name ILIKE '%' || v_raw || '%'
        ))
    ),
    best_candidate AS (
        SELECT
            match_contact_id,
            match_company_id,
            priority
        FROM candidate_matches
        ORDER BY priority ASC
        LIMIT 1
    )
    SELECT
        c.id AS company_id,
        c.name AS company_name,
        co.id AS contact_id,
        NULLIF(btrim(co.first_name || ' ' || COALESCE(co.last_name, '')), '') AS contact_person,
        COALESCE(co.email_active, co.email_2) AS email,
        COALESCE(co.phone_direct, co.phone_2) AS phone,
        c.address_state AS state_province,
        c.address_country AS country,
        COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id) AS pic_id,
        p.name AS pic_name,
        CASE
            WHEN s.id  IS NOT NULL THEN 'customer'
            WHEN i.id  IS NOT NULL THEN 'inquiry'
            WHEN w.id  IS NOT NULL THEN 'warm_lead'
            WHEN pc.id IS NOT NULL THEN 'prospect'
            ELSE 'contact'
        END AS stage
    FROM best_candidate bc
    LEFT JOIN public.contacts co ON co.id = bc.match_contact_id
    LEFT JOIN LATERAL (
        SELECT cc.company_id
        FROM public.company_contacts cc
        WHERE cc.contact_id = co.id
        ORDER BY cc.is_primary DESC, cc.company_id ASC
        LIMIT 1
    ) cc_lat ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            bc.match_company_id,
            cc_lat.company_id,
            s_sub.company_id,
            i_sub.company_id,
            w_sub.company_id,
            pc_sub.company_id
        ) AS resolved_company_id
        FROM (SELECT 1) _
        LEFT JOIN (SELECT company_id FROM public.sales WHERE contact_id = co.id ORDER BY created_at DESC LIMIT 1) s_sub ON TRUE
        LEFT JOIN (SELECT company_id FROM public.inquiries WHERE contact_id = co.id ORDER BY created_at DESC LIMIT 1) i_sub ON TRUE
        LEFT JOIN (SELECT company_id FROM public.warm_leads WHERE contact_id = co.id ORDER BY created_at DESC LIMIT 1) w_sub ON TRUE
        LEFT JOIN (SELECT company_id FROM public.prospect_clients WHERE contact_id = co.id ORDER BY created_at DESC LIMIT 1) pc_sub ON TRUE
    ) comp_res ON TRUE
    LEFT JOIN public.companies c ON c.id = comp_res.resolved_company_id
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.sales x
        WHERE (c.id IS NOT NULL AND x.company_id = c.id) OR (co.id IS NOT NULL AND x.contact_id = co.id)
        ORDER BY x.created_at DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.inquiries x
        WHERE (c.id IS NOT NULL AND x.company_id = c.id) OR (co.id IS NOT NULL AND x.contact_id = co.id)
        ORDER BY x.created_at DESC LIMIT 1
    ) i ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.warm_leads x
        WHERE (c.id IS NOT NULL AND x.company_id = c.id) OR (co.id IS NOT NULL AND x.contact_id = co.id)
        ORDER BY x.created_at DESC LIMIT 1
    ) w ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.prospect_clients x
        WHERE (c.id IS NOT NULL AND x.company_id = c.id) OR (co.id IS NOT NULL AND x.contact_id = co.id)
        ORDER BY x.created_at DESC LIMIT 1
    ) pc ON TRUE
    LEFT JOIN public.pics p ON p.id = COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id)
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_client_by_identity(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_identity(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
