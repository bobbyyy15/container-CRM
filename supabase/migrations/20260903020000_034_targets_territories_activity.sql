-- 034_targets_territories_activity.sql
--
-- Backs the three configuration/activity screens that shipped as static mockups
-- (Daily Targets, Service Territories, Daily Tasks) and removes the hardcoded
-- zeroes from get_dashboard_charts.
--
-- The key relationship: Daily Tasks is the DATA ENTRY point for outreach activity,
-- and the Outreach Dashboard / PIC Performance screens are its read-outs. There was
-- previously nowhere in the schema to record a call/email/text, which is why those
-- screens hardcoded 0 -- it was never a frontend faking problem.

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Daily / monthly targets (singleton config row)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_targets (
    id                          BOOLEAN PRIMARY KEY DEFAULT TRUE,
    monthly_gross_profit_target NUMERIC(14,2) NOT NULL DEFAULT 0,
    working_days_per_month      INTEGER NOT NULL DEFAULT 22,
    daily_email_target          INTEGER NOT NULL DEFAULT 0,
    daily_call_target_min       INTEGER NOT NULL DEFAULT 0,
    daily_call_target_preferred INTEGER NOT NULL DEFAULT 0,
    daily_text_target           INTEGER NOT NULL DEFAULT 0,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Only one configuration row may ever exist.
    CONSTRAINT daily_targets_singleton CHECK (id)
);

INSERT INTO public.daily_targets (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.daily_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Targets readable by all authenticated users" ON public.daily_targets;
CREATE POLICY "Targets readable by all authenticated users"
    ON public.daily_targets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Targets editable by admin only" ON public.daily_targets;
CREATE POLICY "Targets editable by admin only"
    ON public.daily_targets FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. Service territories
-- ───────────────────────────────────────────────────────────────────────────────
-- NOTE: service_territories already exists from migration 001 as an unused
-- placeholder (id, name, description, created_at) -- created, RLS-enabled, and
-- then never populated or referenced by any code. It exists on every database
-- including fresh ones, so CREATE TABLE IF NOT EXISTS would silently no-op and
-- leave the new columns missing. Extend the existing table instead.
CREATE TABLE IF NOT EXISTS public.service_territories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL
);

ALTER TABLE public.service_territories
    ADD COLUMN IF NOT EXISTS region     TEXT    NOT NULL DEFAULT 'Unassigned',
    ADD COLUMN IF NOT EXISTS enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Required for the ON CONFLICT seed below.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.service_territories'::regclass
          AND conname  = 'service_territories_region_name_key'
    ) THEN
        ALTER TABLE public.service_territories
            ADD CONSTRAINT service_territories_region_name_key UNIQUE (region, name);
    END IF;
END $$;

-- Seed with the list that was previously hardcoded in the frontend, so enabling
-- this migration doesn't visually change the screen -- it just makes it editable.
INSERT INTO public.service_territories (region, name, sort_order)
SELECT 'Northern United States', name, ordinality::int
FROM unnest(ARRAY[
    'Minnesota','Wisconsin','Michigan','Illinois','Indiana','Ohio','North Dakota',
    'South Dakota','Montana','Idaho','Washington','Oregon','Iowa','Nebraska',
    'Wyoming','Colorado','Pennsylvania','New York'
]) WITH ORDINALITY AS t(name, ordinality)
ON CONFLICT (region, name) DO NOTHING;

INSERT INTO public.service_territories (region, name, sort_order)
SELECT 'Canadian Provinces', name, ordinality::int
FROM unnest(ARRAY[
    'Alberta','British Columbia','Saskatchewan','Manitoba','Ontario','Quebec',
    'Nova Scotia','New Brunswick'
]) WITH ORDINALITY AS t(name, ordinality)
ON CONFLICT (region, name) DO NOTHING;

ALTER TABLE public.service_territories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Territories readable by all authenticated users" ON public.service_territories;
CREATE POLICY "Territories readable by all authenticated users"
    ON public.service_territories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Territories writable by admin only" ON public.service_territories;
CREATE POLICY "Territories writable by admin only"
    ON public.service_territories FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. Daily outreach activity (one row per PIC per day)
-- ───────────────────────────────────────────────────────────────────────────────
-- Deliberately does NOT store warm-leads/inquiries/quotations/sales generated:
-- those are already recorded in the pipeline tables and are derived on read, so
-- they can't drift out of sync with reality the way a hand-typed count would.
CREATE TABLE IF NOT EXISTS public.daily_activity (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pic_id           UUID NOT NULL REFERENCES public.pics(id) ON DELETE CASCADE,
    entry_date       DATE NOT NULL DEFAULT CURRENT_DATE,

    emails_completed INTEGER NOT NULL DEFAULT 0 CHECK (emails_completed >= 0),
    email_replies    INTEGER NOT NULL DEFAULT 0 CHECK (email_replies    >= 0),
    emails_bounced   INTEGER NOT NULL DEFAULT 0 CHECK (emails_bounced   >= 0),

    calls_completed  INTEGER NOT NULL DEFAULT 0 CHECK (calls_completed  >= 0),
    calls_answered   INTEGER NOT NULL DEFAULT 0 CHECK (calls_answered   >= 0),
    calls_unanswered INTEGER NOT NULL DEFAULT 0 CHECK (calls_unanswered >= 0),

    texts_completed  INTEGER NOT NULL DEFAULT 0 CHECK (texts_completed  >= 0),
    text_replies     INTEGER NOT NULL DEFAULT 0 CHECK (text_replies     >= 0),
    texts_opted_out  INTEGER NOT NULL DEFAULT 0 CHECK (texts_opted_out  >= 0),

    notes            TEXT,
    created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (pic_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_date    ON public.daily_activity (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_pic_date ON public.daily_activity (pic_id, entry_date DESC);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read: PIC Performance is a leaderboard, so a manager
-- has to be able to see other PICs' numbers.
DROP POLICY IF EXISTS "Activity readable by all authenticated users" ON public.daily_activity;
CREATE POLICY "Activity readable by all authenticated users"
    ON public.daily_activity FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Activity writable by owning PIC or admin" ON public.daily_activity;
CREATE POLICY "Activity writable by owning PIC or admin"
    ON public.daily_activity FOR ALL TO authenticated
    USING (public.user_has_pipeline_access(pic_id))
    WITH CHECK (public.user_has_pipeline_access(pic_id));

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. Upsert helper for the Daily Tasks screen
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_daily_activity(
    p_pic_id           UUID,
    p_entry_date       DATE,
    p_emails_completed INTEGER DEFAULT 0,
    p_email_replies    INTEGER DEFAULT 0,
    p_emails_bounced   INTEGER DEFAULT 0,
    p_calls_completed  INTEGER DEFAULT 0,
    p_calls_answered   INTEGER DEFAULT 0,
    p_calls_unanswered INTEGER DEFAULT 0,
    p_texts_completed  INTEGER DEFAULT 0,
    p_text_replies     INTEGER DEFAULT 0,
    p_texts_opted_out  INTEGER DEFAULT 0,
    p_notes            TEXT DEFAULT NULL,
    p_actor_id         UUID DEFAULT NULL
) RETURNS public.daily_activity AS $$
DECLARE
    v_row public.daily_activity;
BEGIN
    INSERT INTO public.daily_activity AS da (
        pic_id, entry_date,
        emails_completed, email_replies, emails_bounced,
        calls_completed, calls_answered, calls_unanswered,
        texts_completed, text_replies, texts_opted_out,
        notes, created_by
    ) VALUES (
        p_pic_id, COALESCE(p_entry_date, CURRENT_DATE),
        p_emails_completed, p_email_replies, p_emails_bounced,
        p_calls_completed, p_calls_answered, p_calls_unanswered,
        p_texts_completed, p_text_replies, p_texts_opted_out,
        p_notes, p_actor_id
    )
    ON CONFLICT (pic_id, entry_date) DO UPDATE SET
        emails_completed = EXCLUDED.emails_completed,
        email_replies    = EXCLUDED.email_replies,
        emails_bounced   = EXCLUDED.emails_bounced,
        calls_completed  = EXCLUDED.calls_completed,
        calls_answered   = EXCLUDED.calls_answered,
        calls_unanswered = EXCLUDED.calls_unanswered,
        texts_completed  = EXCLUDED.texts_completed,
        text_replies     = EXCLUDED.text_replies,
        texts_opted_out  = EXCLUDED.texts_opted_out,
        notes            = EXCLUDED.notes,
        updated_at       = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. Real dashboard charts -- no more hardcoded zeroes
-- ───────────────────────────────────────────────────────────────────────────────
-- Changes vs 027:
--   * PIC_DATA calls/emails/texts now come from daily_activity instead of literal 0
--   * PIC_DATA gains leads/inquiries/quotes/revenue, which the frontend table has
--     always rendered but the function never returned (they showed blank)
--   * PIC_DATA is now scoped to the CURRENT MONTH, matching the "This Month" label
--     the PIC Performance screen has always displayed (it was previously all-time)
--   * PIC_DATA is built from pics LEFT JOINed to sales, so a PIC with outreach
--     activity but no closed sales still appears on the leaderboard
--   * LOSS_REASONS is derived from inquiry rejection reasons instead of always []
CREATE OR REPLACE FUNCTION public.get_dashboard_charts(p_pic_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_profit_chart JSONB;
    v_category_chart JSONB;
    v_inquiry_status JSONB;
    v_pic_performance JSONB;
    v_loss_reasons JSONB;
    v_month_start DATE := date_trunc('month', now())::date;
BEGIN
    -- 1. Profit Chart (Last 6 months)
    WITH months AS (
        SELECT generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), '1 month')::date AS month_start
    ),
    monthly_sales AS (
        SELECT
            date_trunc('month', created_at)::date AS month_start,
            SUM(revenue) AS revenue,
            SUM(gross_profit) AS profit,
            SUM(revenue - gross_profit) AS cost
        FROM public.sales
        WHERE status = 'Won'
        AND (p_pic_id IS NULL OR pic_id = p_pic_id)
        GROUP BY date_trunc('month', created_at)::date
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'm', to_char(m.month_start, 'Mon'),
            'revenue', COALESCE(s.revenue, 0),
            'profit', COALESCE(s.profit, 0),
            'cost', COALESCE(s.cost, 0)
        )
    ) INTO v_profit_chart
    FROM months m
    LEFT JOIN monthly_sales s ON s.month_start = m.month_start;

    -- 2. Category Data
    WITH item_categories AS (
        SELECT
            split_part(qi.description, ' ', 1) AS category_name,
            COUNT(*) AS cnt
        FROM public.sales s
        JOIN public.quotation_items qi ON qi.quotation_id = s.quotation_id
        WHERE s.status = 'Won'
        AND (p_pic_id IS NULL OR s.pic_id = p_pic_id)
        GROUP BY split_part(qi.description, ' ', 1)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(NULLIF(category_name, ''), 'Unknown'),
            'value', cnt,
            'color', CASE
                WHEN category_name = '20ft' THEN '#315EF6'
                WHEN category_name = '40ft' THEN '#0D9488'
                WHEN category_name = '10ft' THEN '#7C3AED'
                ELSE '#D97706' END
        )
    ) INTO v_category_chart
    FROM item_categories;

    IF v_category_chart IS NULL THEN v_category_chart := '[]'::jsonb; END IF;

    -- 3. Inquiry Statuses
    WITH statuses AS (
        SELECT status, COUNT(*) AS cnt
        FROM public.inquiries
        WHERE (p_pic_id IS NULL OR pic_id = p_pic_id)
        GROUP BY status
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', status,
            'value', cnt,
            'color', CASE
                WHEN status = 'New' THEN '#315EF6'
                WHEN status = 'Contacted' THEN '#D97706'
                WHEN status = 'Quoting' THEN '#7C3AED'
                WHEN status = 'Converted to Sale' THEN '#059669'
                ELSE '#6B7280' END
        )
    ) INTO v_inquiry_status
    FROM statuses;

    IF v_inquiry_status IS NULL THEN v_inquiry_status := '[]'::jsonb; END IF;

    -- 4. PIC Performance Leaderboard (current month)
    WITH scoped_pics AS (
        SELECT p.id, p.name
        FROM public.pics p
        WHERE p.status = 'active'
          AND (p_pic_id IS NULL OR p.id = p_pic_id)
    ),
    sale_stats AS (
        SELECT s.pic_id,
               COUNT(*)                AS sales_count,
               SUM(s.revenue)          AS rev,
               SUM(s.gross_profit)     AS profit,
               SUM(s.total_units)      AS units
        FROM public.sales s
        WHERE s.status = 'Won' AND s.created_at >= v_month_start
        GROUP BY s.pic_id
    ),
    activity_stats AS (
        SELECT a.pic_id,
               SUM(a.calls_completed)  AS calls,
               SUM(a.emails_completed) AS emails,
               SUM(a.texts_completed)  AS texts
        FROM public.daily_activity a
        WHERE a.entry_date >= v_month_start
        GROUP BY a.pic_id
    ),
    lead_stats AS (
        SELECT pic_id, COUNT(*) AS cnt FROM public.warm_leads
        WHERE created_at >= v_month_start GROUP BY pic_id
    ),
    inquiry_stats AS (
        SELECT pic_id, COUNT(*) AS cnt FROM public.inquiries
        WHERE created_at >= v_month_start GROUP BY pic_id
    ),
    quote_stats AS (
        SELECT pic_id, COUNT(*) AS cnt FROM public.quotations
        WHERE created_at >= v_month_start GROUP BY pic_id
    ),
    combined AS (
        SELECT
            sp.name,
            COALESCE(ss.profit, 0)      AS profit,
            COALESCE(ss.rev, 0)         AS rev,
            COALESCE(ss.sales_count, 0) AS sales_count,
            COALESCE(ss.units, 0)       AS units,
            COALESCE(act.calls, 0)      AS calls,
            COALESCE(act.emails, 0)     AS emails,
            COALESCE(act.texts, 0)      AS texts,
            COALESCE(ls.cnt, 0)         AS leads,
            COALESCE(ins.cnt, 0)        AS inquiries,
            COALESCE(qs.cnt, 0)         AS quotes
        FROM scoped_pics sp
        LEFT JOIN sale_stats     ss  ON ss.pic_id  = sp.id
        LEFT JOIN activity_stats act ON act.pic_id = sp.id
        LEFT JOIN lead_stats     ls  ON ls.pic_id  = sp.id
        LEFT JOIN inquiry_stats  ins ON ins.pic_id = sp.id
        LEFT JOIN quote_stats    qs  ON qs.pic_id  = sp.id
        -- Hide PICs with no activity at all this month rather than padding the
        -- leaderboard with all-zero rows.
        WHERE COALESCE(ss.sales_count,0) + COALESCE(act.calls,0) + COALESCE(act.emails,0)
            + COALESCE(act.texts,0) + COALESCE(ls.cnt,0) + COALESCE(ins.cnt,0)
            + COALESCE(qs.cnt,0) > 0
        ORDER BY profit DESC NULLS LAST, rev DESC NULLS LAST
        LIMIT 5
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', name,
            'initials', upper(substring(name from 1 for 1)),
            'profit', profit,
            'revenue', rev,
            'sales', sales_count,
            'units', units,
            'calls', calls,
            'emails', emails,
            'texts', texts,
            'leads', leads,
            'inquiries', inquiries,
            'quotes', quotes
        )
    ) INTO v_pic_performance
    FROM combined;

    IF v_pic_performance IS NULL THEN v_pic_performance := '[]'::jsonb; END IF;

    -- 5. Loss reasons -- why inquiries died, from the structured rejection_reason
    --    captured at validation/quotation-rejection time.
    WITH reasons AS (
        SELECT btrim(rejection_reason) AS reason, COUNT(*) AS cnt
        FROM public.inquiries
        WHERE status IN ('Validation Rejected', 'Quotation Rejected', 'Lost')
          AND NULLIF(btrim(rejection_reason), '') IS NOT NULL
          AND (p_pic_id IS NULL OR pic_id = p_pic_id)
        GROUP BY btrim(rejection_reason)
        ORDER BY cnt DESC
        LIMIT 6
    ),
    ranked AS (
        SELECT reason, cnt, row_number() OVER (ORDER BY cnt DESC) AS rn FROM reasons
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'reason', reason,
            'count', cnt,
            'color', (ARRAY['#DC2626','#EA580C','#D97706','#7C3AED','#0D9488','#6B7280'])[
                LEAST(rn, 6)::int
            ]
        )
    ) INTO v_loss_reasons
    FROM ranked;

    IF v_loss_reasons IS NULL THEN v_loss_reasons := '[]'::jsonb; END IF;

    RETURN jsonb_build_object(
        'profitChartData', COALESCE(v_profit_chart, '[]'::jsonb),
        'categoryData', v_category_chart,
        'inquiryStatusData', v_inquiry_status,
        'PIC_DATA', v_pic_performance,
        'LOSS_REASONS', v_loss_reasons
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
