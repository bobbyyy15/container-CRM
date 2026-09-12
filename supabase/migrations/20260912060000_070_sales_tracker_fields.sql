-- Sales Tracker, per the client's feedback.
--
-- 1. Sale number. Sales already carried a sale_number, allocated sequentially by
--    generate_sale_number() from the document_counters table (migration 036) in the form
--    SL-2026-0043. Sales Tracker never showed it: the reference on screen was derived from
--    the row id instead -- "SAL-CF0C7B82" -- which is why the number looked random and
--    could not be edited. The existing generator is kept and taught the client's WAVE
--    format rather than replaced, so allocation stays sequential and collision-free.
--
--    Their numbers are already around WAVE-10330, so the counter starts above that and an
--    automatically allocated number can never land on one of theirs.
--
-- 2. Invoice number. A separate field, filled in by hand. Not derived from the sale number
--    and never treated as the same value.
--
-- 3. Type. container_categories already models exactly this concept, so it is reused
--    rather than duplicated. The client writes the trade shorthand (DC, DD, OS, Flat Rack,
--    Reefer), so the catalog gains a `code` column carrying those, and Open-Side is added,
--    since they use OS and the catalog only had Open-Top.
--
-- 4. Cancelled. sales_status_valid allowed only Pending and Won while the API schema and
--    the status chip both offer Cancelled, so cancelling a sale failed on the constraint.
--    Corrected here rather than dropped.

-- ── Type ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.container_categories ADD COLUMN IF NOT EXISTS code TEXT;

INSERT INTO public.container_categories (name) VALUES ('Open-Side')
ON CONFLICT (name) DO NOTHING;

UPDATE public.container_categories SET code = map.code
FROM (VALUES
  ('Dry', 'DC'),
  ('Double-Door', 'DD'),
  ('Open-Side', 'OS'),
  ('Open-Top', 'OT'),
  ('Flat-Rack', 'FR'),
  ('Refrigerated', 'RF'),
  ('High-Cube', 'HC')
) AS map(name, code)
WHERE public.container_categories.name = map.name
  AND public.container_categories.code IS DISTINCT FROM map.code;

CREATE UNIQUE INDEX IF NOT EXISTS container_categories_code_unique
  ON public.container_categories(code) WHERE code IS NOT NULL;

-- ── Invoice number and type on a sale ───────────────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS container_category_id UUID REFERENCES public.container_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_invoice_number_idx ON public.sales(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_container_category_idx ON public.sales(container_category_id) WHERE container_category_id IS NOT NULL;

-- ── WAVE numbering, on the existing allocator ───────────────────────────────────────────
-- Start the WAVE counter above the numbers the client already uses.
INSERT INTO public.document_counters (prefix, year, last_value)
VALUES ('WAVE', EXTRACT(YEAR FROM NOW())::int, 10330)
ON CONFLICT (prefix, year) DO UPDATE
SET last_value = GREATEST(public.document_counters.last_value, 10330);

/**
 * WAVE numbers do not carry the year the way SL-2026-0043 did -- the client's run
 * (WAVE-10317, WAVE-10321, WAVE-10330) is one continuous series -- so this allocates from
 * the counter of the current year but formats without it, and takes the highest counter
 * across years so the series never restarts in January.
 */
CREATE OR REPLACE FUNCTION public.next_wave_sale_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM NOW())::int;
    v_highest INTEGER;
    v_next INTEGER;
BEGIN
    SELECT COALESCE(MAX(last_value), 10330) INTO v_highest
    FROM public.document_counters WHERE prefix = 'WAVE';

    INSERT INTO public.document_counters (prefix, year, last_value)
    VALUES ('WAVE', v_year, v_highest + 1)
    ON CONFLICT (prefix, year)
    DO UPDATE SET last_value = GREATEST(public.document_counters.last_value, v_highest) + 1
    RETURNING last_value INTO v_next;

    RETURN 'WAVE-' || v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_wave_sale_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_wave_sale_number() TO service_role;

-- The trigger that fills a blank sale number now issues WAVE numbers. A number supplied by
-- the caller is still respected, which is what makes the field editable.
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.sale_number IS NULL OR btrim(NEW.sale_number) = '' THEN
        NEW.sale_number := public.next_wave_sale_number();
    ELSE
        NEW.sale_number := btrim(NEW.sale_number);
    END IF;
    RETURN NEW;
END;
$$;

-- Uniqueness was already enforced by sales_sale_number_key; make it case-insensitive so
-- "wave-10317" cannot be entered alongside "WAVE-10317".
CREATE UNIQUE INDEX IF NOT EXISTS sales_sale_number_unique_ci ON public.sales(upper(btrim(sale_number)));

-- Existing sales keep their SL- numbers: they are what was issued at the time, and
-- renumbering history would break any paperwork already sent. Only new sales get WAVE
-- numbers, so the format check accepts both shapes.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_number_format;
ALTER TABLE public.sales ADD CONSTRAINT sales_sale_number_format
  CHECK (sale_number ~ '^(WAVE-[0-9]{3,10}|SL-[0-9]{4}-[0-9]{4,10})$');

-- ── Cancelled ───────────────────────────────────────────────────────────────────────────
-- Cancelled sales stay in Sales Tracker: they are history. Every financial query already
-- filters on status = 'Won' (the dashboard metrics, get_dashboard_charts,
-- customer_accounts_view), so allowing the status puts no cancelled money into any total.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_valid;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_valid
  CHECK (status IN ('Pending', 'Won', 'Cancelled'));

NOTIFY pgrst, 'reload schema';
