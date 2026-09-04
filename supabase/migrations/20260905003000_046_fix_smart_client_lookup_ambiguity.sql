-- Qualify pipeline columns that share names with RETURNS TABLE output columns.
-- Migration 045's function compiled, but PostgreSQL detected the ambiguity when
-- linting/executing its lateral fallback queries.

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
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            1 AS priority
        FROM public.contacts AS co
        WHERE v_email_norm IS NOT NULL AND (
            co.email_active_normalized = v_email_norm
            OR co.email_2_normalized = v_email_norm
            OR co.email_active ILIKE v_raw
            OR co.email_2 ILIKE v_raw
        )
        UNION ALL
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            2 AS priority
        FROM public.contacts AS co
        WHERE v_phone_norm IS NOT NULL AND length(v_phone_norm) >= 4 AND (
            co.phone_direct_normalized = v_phone_norm
            OR co.phone_2_normalized = v_phone_norm
            OR (length(v_phone_norm) >= 7 AND (
                co.phone_direct_normalized LIKE '%' || v_phone_norm || '%'
                OR v_phone_norm LIKE '%' || co.phone_direct_normalized || '%'
                OR co.phone_2_normalized LIKE '%' || v_phone_norm || '%'
                OR v_phone_norm LIKE '%' || co.phone_2_normalized || '%'
            ))
        )
        UNION ALL
        SELECT
            co.id AS match_contact_id,
            NULL::UUID AS match_company_id,
            3 AS priority
        FROM public.contacts AS co
        WHERE v_name_norm IS NOT NULL AND length(v_raw) >= 3 AND (
            co.first_name || ' ' || COALESCE(co.last_name, '') ILIKE '%' || v_raw || '%'
            OR co.first_name ILIKE '%' || v_raw || '%'
            OR co.last_name ILIKE '%' || v_raw || '%'
        )
        UNION ALL
        SELECT
            cc.contact_id AS match_contact_id,
            c.id AS match_company_id,
            4 AS priority
        FROM public.companies AS c
        LEFT JOIN public.company_contacts AS cc
            ON cc.company_id = c.id AND cc.is_primary = true
        WHERE v_name_norm IS NOT NULL AND length(v_raw) >= 3 AND (
            c.name_normalized = v_name_norm
            OR c.name ILIKE '%' || v_raw || '%'
        )
    ),
    best_candidate AS (
        SELECT
            candidate_matches.match_contact_id,
            candidate_matches.match_company_id,
            candidate_matches.priority
        FROM candidate_matches
        ORDER BY candidate_matches.priority ASC
        LIMIT 1
    )
    SELECT
        c.id,
        c.name,
        co.id,
        NULLIF(btrim(co.first_name || ' ' || COALESCE(co.last_name, '')), ''),
        COALESCE(co.email_active, co.email_2),
        COALESCE(co.phone_direct, co.phone_2),
        c.address_state,
        c.address_country,
        COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id),
        p.name,
        CASE
            WHEN s.id IS NOT NULL THEN 'customer'
            WHEN i.id IS NOT NULL THEN 'inquiry'
            WHEN w.id IS NOT NULL THEN 'warm_lead'
            WHEN pc.id IS NOT NULL THEN 'prospect'
            ELSE 'contact'
        END
    FROM best_candidate AS bc
    LEFT JOIN public.contacts AS co ON co.id = bc.match_contact_id
    LEFT JOIN LATERAL (
        SELECT cc.company_id
        FROM public.company_contacts AS cc
        WHERE cc.contact_id = co.id
        ORDER BY cc.is_primary DESC, cc.company_id ASC
        LIMIT 1
    ) AS cc_lat ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            bc.match_company_id,
            cc_lat.company_id,
            s_sub.company_id,
            i_sub.company_id,
            w_sub.company_id,
            pc_sub.company_id
        ) AS resolved_company_id
        FROM (SELECT 1) AS seed
        LEFT JOIN LATERAL (
            SELECT sale.company_id
            FROM public.sales AS sale
            WHERE sale.contact_id = co.id
            ORDER BY sale.created_at DESC
            LIMIT 1
        ) AS s_sub ON TRUE
        LEFT JOIN LATERAL (
            SELECT inquiry.company_id
            FROM public.inquiries AS inquiry
            WHERE inquiry.contact_id = co.id
            ORDER BY inquiry.created_at DESC
            LIMIT 1
        ) AS i_sub ON TRUE
        LEFT JOIN LATERAL (
            SELECT warm.company_id
            FROM public.warm_leads AS warm
            WHERE warm.contact_id = co.id
            ORDER BY warm.created_at DESC
            LIMIT 1
        ) AS w_sub ON TRUE
        LEFT JOIN LATERAL (
            SELECT prospect.company_id
            FROM public.prospect_clients AS prospect
            WHERE prospect.contact_id = co.id
            ORDER BY prospect.created_at DESC
            LIMIT 1
        ) AS pc_sub ON TRUE
    ) AS company_resolution ON TRUE
    LEFT JOIN public.companies AS c ON c.id = company_resolution.resolved_company_id
    LEFT JOIN LATERAL (
        SELECT sale.id, sale.pic_id
        FROM public.sales AS sale
        WHERE (c.id IS NOT NULL AND sale.company_id = c.id)
           OR (co.id IS NOT NULL AND sale.contact_id = co.id)
        ORDER BY sale.created_at DESC
        LIMIT 1
    ) AS s ON TRUE
    LEFT JOIN LATERAL (
        SELECT inquiry.id, inquiry.pic_id
        FROM public.inquiries AS inquiry
        WHERE (c.id IS NOT NULL AND inquiry.company_id = c.id)
           OR (co.id IS NOT NULL AND inquiry.contact_id = co.id)
        ORDER BY inquiry.created_at DESC
        LIMIT 1
    ) AS i ON TRUE
    LEFT JOIN LATERAL (
        SELECT warm.id, warm.pic_id
        FROM public.warm_leads AS warm
        WHERE (c.id IS NOT NULL AND warm.company_id = c.id)
           OR (co.id IS NOT NULL AND warm.contact_id = co.id)
        ORDER BY warm.created_at DESC
        LIMIT 1
    ) AS w ON TRUE
    LEFT JOIN LATERAL (
        SELECT prospect.id, prospect.pic_id
        FROM public.prospect_clients AS prospect
        WHERE (c.id IS NOT NULL AND prospect.company_id = c.id)
           OR (co.id IS NOT NULL AND prospect.contact_id = co.id)
        ORDER BY prospect.created_at DESC
        LIMIT 1
    ) AS pc ON TRUE
    LEFT JOIN public.pics AS p ON p.id = COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id)
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_client_by_identity(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_identity(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
