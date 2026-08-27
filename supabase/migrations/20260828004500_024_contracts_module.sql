-- 024_contracts_module.sql
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_number TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMPTZ;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pickup_status TEXT DEFAULT 'Pending';

-- Function to generate contract number
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val INT;
BEGIN
    IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
        -- Get a unique random number or use a sequence
        -- We'll just generate a pseudo-random 4 digit number for simplicity, or we can use a sequence
        NEW.contract_number := 'CT-' || to_char(NOW(), 'YYYY') || '-' || LPAD((floor(random() * 9000) + 1000)::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_contract_number ON public.contracts;
CREATE TRIGGER trigger_generate_contract_number
BEFORE INSERT ON public.contracts
FOR EACH ROW EXECUTE PROCEDURE generate_contract_number();

-- Function to generate sale number
CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_number IS NULL OR NEW.sale_number = '' THEN
        NEW.sale_number := 'SL-' || to_char(NOW(), 'YYYY') || '-' || LPAD((floor(random() * 9000) + 1000)::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_sale_number ON public.sales;
CREATE TRIGGER trigger_generate_sale_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE PROCEDURE generate_sale_number();

-- Update existing sales
UPDATE public.sales SET sale_number = 'SL-' || to_char(NOW(), 'YYYY') || '-' || LPAD((floor(random() * 9000) + 1000)::text, 4, '0') WHERE sale_number IS NULL;

-- Create RLS for contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contracts viewable by everyone in their silo" ON public.contracts
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.sales s 
        WHERE s.id = contracts.sale_id 
        AND public.user_has_pipeline_access(s.pic_id)
    )
);

CREATE POLICY "Contracts insertable by everyone in their silo" ON public.contracts
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.sales s 
        WHERE s.id = sale_id 
        AND public.user_has_pipeline_access(s.pic_id)
    )
);

CREATE POLICY "Contracts updatable by everyone in their silo" ON public.contracts
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.sales s 
        WHERE s.id = contracts.sale_id 
        AND public.user_has_pipeline_access(s.pic_id)
    )
);

-- Contract view to pull everything together for the frontend
CREATE OR REPLACE VIEW public.contracts_view AS
SELECT 
    c.id,
    c.contract_number,
    c.status AS contract_status,
    c.pickup_date,
    c.pickup_status,
    c.created_at,
    s.id AS sale_id,
    s.sale_number,
    s.pic_id,
    s.total_units,
    s.revenue,
    p.name AS pic_name,
    comp.name AS company_name,
    (
        SELECT row_to_json(cont.*)
        FROM public.contacts cont
        JOIN public.company_contacts cc ON cc.contact_id = cont.id
        WHERE cc.company_id = comp.id AND cc.is_primary = true
        LIMIT 1
    ) AS primary_contact,
    -- We'll try to get category and size from the quotation items if they exist
    (
        SELECT jsonb_agg(jsonb_build_object('description', qi.description))
        FROM public.quotation_items qi
        WHERE qi.quotation_id = s.quotation_id
    ) AS items
FROM public.contracts c
JOIN public.sales s ON s.id = c.sale_id
JOIN public.companies comp ON comp.id = s.company_id
LEFT JOIN public.pics p ON p.id = s.pic_id;

GRANT SELECT ON public.contracts_view TO authenticated;
GRANT SELECT ON public.contracts_view TO service_role;

NOTIFY pgrst, 'reload schema';
