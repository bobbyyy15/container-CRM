-- 036_sequential_document_numbers.sql
--
-- Fixes a real correctness bug in contract/sale numbering.
--
-- Migration 024 generated both as 'CT-<year>-<random 1000..9999>'. That draws from
-- only 9,000 values per year, and:
--   * contracts.contract_number is UNIQUE, so a collision makes contract creation
--     fail outright. By the birthday bound, ~100 contracts in a year already carries
--     roughly a 42% chance of at least one collision. There was no retry.
--   * sales.sale_number had no unique constraint at all, so collisions there were
--     silent -- two different sales could share an identifier.
--
-- Replaced with a per-(prefix, year) counter that increments atomically, so numbers
-- are sequential, collision-free, and readable (CT-2026-0001, CT-2026-0002, ...).

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Counter table
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_counters (
    prefix     TEXT    NOT NULL,
    year       INTEGER NOT NULL,
    last_value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);

-- Only the trigger functions (SECURITY DEFINER) touch this; no client should.
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. Atomic allocator
-- ───────────────────────────────────────────────────────────────────────────────
-- The INSERT ... ON CONFLICT DO UPDATE takes a row lock on the counter, so two
-- concurrent inserts can never receive the same value.
CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix TEXT)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM NOW())::int;
    v_next INTEGER;
BEGIN
    INSERT INTO public.document_counters (prefix, year, last_value)
    VALUES (p_prefix, v_year, 1)
    ON CONFLICT (prefix, year)
    DO UPDATE SET last_value = public.document_counters.last_value + 1
    RETURNING last_value INTO v_next;

    -- lpad() TRUNCATES when the value is longer than the target width, so a naive
    -- lpad(v_next, 4, '0') would turn 10000 into '1000' and start colliding again.
    RETURN p_prefix || '-' || v_year || '-' ||
           CASE WHEN v_next <= 9999 THEN lpad(v_next::text, 4, '0') ELSE v_next::text END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. Renumber anything already issued, so old random numbers can't collide with
--    newly allocated sequential ones.
-- ───────────────────────────────────────────────────────────────────────────────
WITH renumbered AS (
    SELECT id,
           EXTRACT(YEAR FROM created_at)::int AS yr,
           row_number() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at, id) AS rn
    FROM public.contracts
)
UPDATE public.contracts c
SET contract_number = 'CT-' || r.yr || '-' || lpad(r.rn::text, 4, '0')
FROM renumbered r
WHERE c.id = r.id;

WITH renumbered AS (
    SELECT id,
           EXTRACT(YEAR FROM created_at)::int AS yr,
           row_number() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at, id) AS rn
    FROM public.sales
)
UPDATE public.sales s
SET sale_number = 'SL-' || r.yr || '-' || lpad(r.rn::text, 4, '0')
FROM renumbered r
WHERE s.id = r.id;

-- Seed the counters so the next allocation continues after what already exists.
INSERT INTO public.document_counters (prefix, year, last_value)
SELECT 'CT', EXTRACT(YEAR FROM created_at)::int, COUNT(*)
FROM public.contracts GROUP BY EXTRACT(YEAR FROM created_at)
ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(public.document_counters.last_value, EXCLUDED.last_value);

INSERT INTO public.document_counters (prefix, year, last_value)
SELECT 'SL', EXTRACT(YEAR FROM created_at)::int, COUNT(*)
FROM public.sales GROUP BY EXTRACT(YEAR FROM created_at)
ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(public.document_counters.last_value, EXCLUDED.last_value);

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. Point the triggers at the allocator
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
        NEW.contract_number := public.next_document_number('CT');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_number IS NULL OR NEW.sale_number = '' THEN
        NEW.sale_number := public.next_document_number('SL');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. Enforce sale_number uniqueness, which was never constrained
-- ───────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.sales'::regclass
          AND conname  = 'sales_sale_number_key'
    ) THEN
        ALTER TABLE public.sales ADD CONSTRAINT sales_sale_number_key UNIQUE (sale_number);
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
