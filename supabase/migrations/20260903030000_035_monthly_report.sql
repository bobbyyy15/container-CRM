-- 035_monthly_report.sql
--
-- Backs the Monthly Report screen. Everything is computed for one calendar month
-- in a single round trip rather than a dozen separate queries, because the report
-- is rendered as one document and exported as one file.
--
-- p_pic_id scopes the whole report to a single PIC (a sales_manager sees only their
-- own book); NULL returns the org-wide report for admins.

CREATE OR REPLACE FUNCTION public.get_monthly_report(
    p_month_start DATE,
    p_pic_id      UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_start      TIMESTAMPTZ := date_trunc('month', p_month_start);
    v_end        TIMESTAMPTZ := date_trunc('month', p_month_start) + interval '1 month';
    v_prev_start TIMESTAMPTZ := date_trunc('month', p_month_start) - interval '1 month';

    v_summary      JSONB;
    v_pipeline     JSONB;
    v_outreach     JSONB;
    v_pics         JSONB;
    v_customers    JSONB;
    v_loss         JSONB;
    v_targets      JSONB;
    v_prev_profit  NUMERIC;
BEGIN
    -- 1. Headline numbers for the month
    SELECT jsonb_build_object(
        'revenue',      COALESCE(SUM(revenue), 0),
        'buying_cost',  COALESCE(SUM(buying_cost), 0),
        'gross_profit', COALESCE(SUM(gross_profit), 0),
        'units',        COALESCE(SUM(total_units), 0),
        'deals_won',    COUNT(*),
        'margin',       CASE WHEN COALESCE(SUM(revenue), 0) > 0
                             THEN ROUND((SUM(gross_profit) / SUM(revenue)) * 100, 1)
                             ELSE 0 END,
        'avg_deal',     CASE WHEN COUNT(*) > 0
                             THEN ROUND(SUM(revenue) / COUNT(*), 2)
                             ELSE 0 END
    ) INTO v_summary
    FROM public.sales
    WHERE status = 'Won'
      AND created_at >= v_start AND created_at < v_end
      AND (p_pic_id IS NULL OR pic_id = p_pic_id);

    -- Prior month's profit, so the report can show month-over-month movement.
    SELECT COALESCE(SUM(gross_profit), 0) INTO v_prev_profit
    FROM public.sales
    WHERE status = 'Won'
      AND created_at >= v_prev_start AND created_at < v_start
      AND (p_pic_id IS NULL OR pic_id = p_pic_id);

    v_summary := v_summary || jsonb_build_object(
        'prev_gross_profit', v_prev_profit,
        'profit_change_pct', CASE WHEN v_prev_profit > 0
            THEN ROUND((((v_summary->>'gross_profit')::numeric - v_prev_profit) / v_prev_profit) * 100, 1)
            ELSE NULL END
    );

    -- 2. What entered each pipeline stage during the month
    SELECT jsonb_build_object(
        'prospects',  (SELECT COUNT(*) FROM public.prospect_clients
                        WHERE created_at >= v_start AND created_at < v_end
                          AND (p_pic_id IS NULL OR pic_id = p_pic_id)),
        'warm_leads', (SELECT COUNT(*) FROM public.warm_leads
                        WHERE created_at >= v_start AND created_at < v_end
                          AND (p_pic_id IS NULL OR pic_id = p_pic_id)),
        'inquiries',  (SELECT COUNT(*) FROM public.inquiries
                        WHERE created_at >= v_start AND created_at < v_end
                          AND (p_pic_id IS NULL OR pic_id = p_pic_id)),
        'quotations', (SELECT COUNT(*) FROM public.quotations
                        WHERE created_at >= v_start AND created_at < v_end
                          AND (p_pic_id IS NULL OR pic_id = p_pic_id)),
        'sales',      (SELECT COUNT(*) FROM public.sales
                        WHERE status = 'Won' AND created_at >= v_start AND created_at < v_end
                          AND (p_pic_id IS NULL OR pic_id = p_pic_id))
    ) INTO v_pipeline;

    -- 3. Outreach actually logged on Daily Tasks for the month
    SELECT jsonb_build_object(
        'emails',         COALESCE(SUM(emails_completed), 0),
        'email_replies',  COALESCE(SUM(email_replies), 0),
        'emails_bounced', COALESCE(SUM(emails_bounced), 0),
        'calls',          COALESCE(SUM(calls_completed), 0),
        'calls_answered', COALESCE(SUM(calls_answered), 0),
        'texts',          COALESCE(SUM(texts_completed), 0),
        'text_replies',   COALESCE(SUM(text_replies), 0),
        'days_logged',    COUNT(DISTINCT entry_date)
    ) INTO v_outreach
    FROM public.daily_activity
    WHERE entry_date >= v_start::date AND entry_date < v_end::date
      AND (p_pic_id IS NULL OR pic_id = p_pic_id);

    -- 4. Configured targets, scaled to the month, so actuals can be judged against them
    SELECT jsonb_build_object(
        'monthly_gross_profit_target', monthly_gross_profit_target,
        'working_days_per_month',      working_days_per_month,
        'monthly_email_target',        daily_email_target * working_days_per_month,
        'monthly_call_target',         daily_call_target_preferred * working_days_per_month,
        'monthly_text_target',         daily_text_target * working_days_per_month
    ) INTO v_targets
    FROM public.daily_targets WHERE id = TRUE;

    -- 5. Per-PIC breakdown
    WITH sale_stats AS (
        SELECT pic_id, COUNT(*) AS deals, SUM(revenue) AS rev,
               SUM(gross_profit) AS profit, SUM(total_units) AS units
        FROM public.sales
        WHERE status = 'Won' AND created_at >= v_start AND created_at < v_end
        GROUP BY pic_id
    ),
    act_stats AS (
        SELECT pic_id, SUM(emails_completed) AS emails,
               SUM(calls_completed) AS calls, SUM(texts_completed) AS texts
        FROM public.daily_activity
        WHERE entry_date >= v_start::date AND entry_date < v_end::date
        GROUP BY pic_id
    ),
    combined AS (
        SELECT p.name,
               COALESCE(s.deals, 0)  AS deals,
               COALESCE(s.rev, 0)    AS revenue,
               COALESCE(s.profit, 0) AS gross_profit,
               COALESCE(s.units, 0)  AS units,
               COALESCE(a.emails, 0) AS emails,
               COALESCE(a.calls, 0)  AS calls,
               COALESCE(a.texts, 0)  AS texts
        FROM public.pics p
        LEFT JOIN sale_stats s ON s.pic_id = p.id
        LEFT JOIN act_stats  a ON a.pic_id = p.id
        WHERE p.status = 'active'
          AND (p_pic_id IS NULL OR p.id = p_pic_id)
          AND COALESCE(s.deals,0) + COALESCE(a.emails,0) + COALESCE(a.calls,0) + COALESCE(a.texts,0) > 0
        ORDER BY COALESCE(s.profit, 0) DESC
    )
    SELECT jsonb_agg(to_jsonb(combined)) INTO v_pics FROM combined;

    -- 6. Top customers by profit contributed this month
    WITH cust AS (
        SELECT c.name AS company,
               COUNT(s.id)          AS deals,
               SUM(s.revenue)       AS revenue,
               SUM(s.gross_profit)  AS gross_profit,
               SUM(s.total_units)   AS units
        FROM public.sales s
        JOIN public.companies c ON c.id = s.company_id
        WHERE s.status = 'Won' AND s.created_at >= v_start AND s.created_at < v_end
          AND (p_pic_id IS NULL OR s.pic_id = p_pic_id)
        GROUP BY c.name
        ORDER BY SUM(s.gross_profit) DESC NULLS LAST
        LIMIT 10
    )
    SELECT jsonb_agg(to_jsonb(cust)) INTO v_customers FROM cust;

    -- 7. Why inquiries were lost this month
    WITH reasons AS (
        SELECT btrim(rejection_reason) AS reason, COUNT(*) AS count
        FROM public.inquiries
        WHERE status IN ('Validation Rejected', 'Quotation Rejected', 'Lost')
          AND NULLIF(btrim(rejection_reason), '') IS NOT NULL
          AND created_at >= v_start AND created_at < v_end
          AND (p_pic_id IS NULL OR pic_id = p_pic_id)
        GROUP BY btrim(rejection_reason)
        ORDER BY COUNT(*) DESC
        LIMIT 10
    )
    SELECT jsonb_agg(to_jsonb(reasons)) INTO v_loss FROM reasons;

    RETURN jsonb_build_object(
        'month',          to_char(v_start, 'YYYY-MM'),
        'month_label',    to_char(v_start, 'FMMonth YYYY'),
        'generated_at',   now(),
        'summary',        COALESCE(v_summary, '{}'::jsonb),
        'pipeline',       COALESCE(v_pipeline, '{}'::jsonb),
        'outreach',       COALESCE(v_outreach, '{}'::jsonb),
        'targets',        COALESCE(v_targets, '{}'::jsonb),
        'pic_breakdown',  COALESCE(v_pics, '[]'::jsonb),
        'top_customers',  COALESCE(v_customers, '[]'::jsonb),
        'loss_reasons',   COALESCE(v_loss, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
