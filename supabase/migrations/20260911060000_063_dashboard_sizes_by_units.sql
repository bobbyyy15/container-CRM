-- The dashboard's container donut grouped won sales by the FIRST WORD of each quotation
-- line item's description, and counted line items. On real data every line item begins
-- "Shipping Container ...", so the whole chart read "Shipping: 1" -- a label that describes
-- the wording of a text field, not the business.
--
-- The size is recorded properly on the inquiry (container_size_id, migration 013), and the
-- sale carries the units. So group by the actual size and sum units. A sale entered
-- manually has no quotation and therefore no size on record; it is counted under
-- "Not specified" rather than dropped, so the donut still adds up to the units sold.

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

    -- 2. Units sold per container size, from the size recorded on the inquiry.
    WITH sized_sales AS (
        SELECT
            COALESCE(size.name, 'Not specified') AS size_name,
            SUM(sale.total_units) AS units
        FROM public.sales sale
        LEFT JOIN public.quotations quote ON quote.id = sale.quotation_id
        LEFT JOIN public.inquiries inquiry ON inquiry.id = quote.inquiry_id
        LEFT JOIN public.container_sizes size ON size.id = inquiry.container_size_id
        WHERE sale.status = 'Won'
          AND (p_pic_id IS NULL OR sale.pic_id = p_pic_id)
        GROUP BY COALESCE(size.name, 'Not specified')
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', size_name,
            'value', units,
            'color', CASE
                WHEN size_name ILIKE '20%' THEN '#315EF6'
                WHEN size_name ILIKE '40%' THEN '#0D9488'
                WHEN size_name ILIKE '10%' THEN '#7C3AED'
                WHEN size_name = 'Not specified' THEN '#9CA3AF'
                ELSE '#D97706' END
        )
        ORDER BY units DESC
    ) INTO v_category_chart
    FROM sized_sales;

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

NOTIFY pgrst, 'reload schema';
