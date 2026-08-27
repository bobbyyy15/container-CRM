-- 023_customer_accounts_view.sql

CREATE OR REPLACE VIEW public.customer_accounts_view AS
SELECT 
    s.company_id,
    s.pic_id,
    p.name AS pic_name,
    c.name AS company_name,
    c.address_state AS state,
    c.address_country AS country,
    MAX(s.created_at) AS last_purchase_date,
    COUNT(s.id) AS sales_count,
    SUM(s.total_units) AS total_units,
    SUM(s.revenue) AS total_revenue,
    SUM(s.gross_profit) AS total_gross_profit,
    CASE 
        WHEN MAX(s.created_at) >= NOW() - INTERVAL '3 months' THEN 'Active'
        ELSE 'Floating'
    END AS status,
    (
        SELECT row_to_json(cont.*)
        FROM public.contacts cont
        JOIN public.company_contacts cc ON cc.contact_id = cont.id
        WHERE cc.company_id = s.company_id AND cc.is_primary = true
        LIMIT 1
    ) AS primary_contact
FROM public.sales s
JOIN public.companies c ON c.id = s.company_id
LEFT JOIN public.pics p ON p.id = s.pic_id
WHERE s.status = 'Won'
GROUP BY s.company_id, s.pic_id, p.name, c.name, c.address_state, c.address_country;

-- Admins do not need access since pipeline is strict for everyone, but if they are ever granted access
-- we just grant SELECT on the view.
GRANT SELECT ON public.customer_accounts_view TO authenticated;
GRANT SELECT ON public.customer_accounts_view TO service_role;

NOTIFY pgrst, 'reload schema';
