-- 041_client_lookup_by_identity.sql
--
-- Creating an inquiry should only require an email or a phone number plus the order
-- details -- the client's information is already in the system, so re-typing the
-- company, contact and location is duplicate data entry and a source of mismatched
-- records.
--
-- Matching reuses normalize_email/normalize_phone so an identity resolves the same
-- way here as it does for the outreach suppression list; "(385) 707-9484" and
-- "+13857079484" are the same client either way.

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
    v_raw  TEXT := btrim(COALESCE(p_identity, ''));
    v_type TEXT;
    v_norm TEXT;
BEGIN
    IF v_raw = '' THEN RETURN; END IF;

    IF v_raw LIKE '%@%' THEN
        v_type := 'email';
        v_norm := public.normalize_email(v_raw);
    ELSE
        v_type := 'phone';
        v_norm := public.normalize_phone(v_raw);
    END IF;
    IF v_norm IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        co.id,
        NULLIF(btrim(co.first_name || ' ' || COALESCE(co.last_name, '')), ''),
        COALESCE(co.email_active, co.email_2),
        COALESCE(co.phone_direct, co.phone_2),
        c.address_state,
        c.address_country,
        -- Whichever PIC already owns this client downstream, so a new inquiry stays
        -- with the person who has the relationship instead of being reassigned.
        COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id),
        p.name,
        -- Furthest stage reached, so the caller can tell the user what they're
        -- attaching to rather than silently creating a parallel record.
        CASE
            WHEN s.id  IS NOT NULL THEN 'customer'
            WHEN i.id  IS NOT NULL THEN 'inquiry'
            WHEN w.id  IS NOT NULL THEN 'warm_lead'
            WHEN pc.id IS NOT NULL THEN 'prospect'
            ELSE 'contact'
        END
    FROM public.contacts co
    LEFT JOIN public.company_contacts cc ON cc.contact_id = co.id AND cc.is_primary = true
    LEFT JOIN public.companies c ON c.id = cc.company_id
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.sales x
        WHERE x.company_id = c.id ORDER BY x.created_at DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.inquiries x
        WHERE x.company_id = c.id ORDER BY x.created_at DESC LIMIT 1
    ) i ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.warm_leads x
        WHERE x.company_id = c.id ORDER BY x.created_at DESC LIMIT 1
    ) w ON TRUE
    LEFT JOIN LATERAL (
        SELECT x.id, x.pic_id FROM public.prospect_clients x
        WHERE x.company_id = c.id ORDER BY x.created_at DESC LIMIT 1
    ) pc ON TRUE
    LEFT JOIN public.pics p ON p.id = COALESCE(s.pic_id, i.pic_id, w.pic_id, pc.pic_id)
    WHERE (v_type = 'email' AND v_norm IN (co.email_active_normalized, co.email_2_normalized))
       OR (v_type = 'phone' AND v_norm IN (co.phone_direct_normalized, co.phone_2_normalized))
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_client_by_identity(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_identity(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
