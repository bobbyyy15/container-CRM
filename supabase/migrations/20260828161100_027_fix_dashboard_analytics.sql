-- 027_fix_dashboard_analytics.sql

CREATE OR REPLACE FUNCTION public.get_dashboard_charts(p_pic_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_profit_chart JSONB;
    v_category_chart JSONB;
    v_inquiry_status JSONB;
    v_pic_performance JSONB;
    v_loss_reasons JSONB;
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

    -- 4. PIC Performance Leaderboard
    WITH pic_stats AS (
        SELECT 
            p.name AS pic,
            COUNT(s.id) AS sales_count,
            SUM(s.revenue) AS rev,
            SUM(s.gross_profit) AS profit,
            SUM(s.total_units) AS units
        FROM public.sales s
        JOIN public.pics p ON p.id = s.pic_id
        WHERE s.status = 'Won'
        AND (p_pic_id IS NULL OR s.pic_id = p_pic_id)
        GROUP BY p.name
        ORDER BY rev DESC NULLS LAST
        LIMIT 5
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', pic,
            'initials', substring(pic from 1 for 1),
            'profit', COALESCE(profit, 0),
            'sales', COALESCE(sales_count, 0),
            'units', COALESCE(units, 0),
            'calls', 0,
            'emails', 0,
            'texts', 0
        )
    ) INTO v_pic_performance
    FROM pic_stats;

    IF v_pic_performance IS NULL THEN v_pic_performance := '[]'::jsonb; END IF;

    v_loss_reasons := '[]'::jsonb;

    RETURN jsonb_build_object(
        'profitChartData', COALESCE(v_profit_chart, '[]'::jsonb),
        'categoryData', v_category_chart,
        'inquiryStatusData', v_inquiry_status,
        'PIC_DATA', v_pic_performance,
        'LOSS_REASONS', v_loss_reasons
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
