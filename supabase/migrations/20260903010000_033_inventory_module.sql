-- 033_inventory_module.sql
--
-- Adds the physical container inventory system. Procurement and Operations both manage
-- stock (INSERT + UPDATE own records); all roles including Sales Managers can VIEW inventory
-- so reps know what's actually in the yard before pitching to a customer.
--
-- Key design decisions (confirmed with team 2026-09-02):
--   - Batch/quantity-based with optional serial numbers (not unit-level records).
--   - "View-All, Edit-Own": any authenticated user reads; Operations/Procurement/Admin write;
--     non-admin updaters are restricted to rows they created.
--   - Status is auto-managed by trigger: 0 = Out of Stock, 1-2 = Low Stock, 3+ = In Stock.
--   - Vendor/supplier field supports filtering stock by source (e.g. Maersk, Evergreen).


-- --- 1. Inventory table -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What the container is
    container_size       TEXT          NOT NULL,   -- e.g. '20ft Standard', '40ft High Cube'
    container_condition  TEXT          NOT NULL,   -- e.g. 'Brand New / One Trip', 'Cargo Worthy (CW)', 'WWT', 'As-Is'
    container_category   TEXT          NOT NULL DEFAULT 'Dry', -- e.g. 'Dry', 'High-Cube', 'Reefer', 'Open Top'

    -- Where it's coming from / sitting
    vendor_supplier      TEXT,                     -- e.g. 'Maersk Surplus', 'Evergreen', 'Local Yard'
    depot_name           TEXT          NOT NULL,   -- e.g. 'Long Beach Depot A', 'Houston Terminal 4'
    city                 TEXT,
    state_province       TEXT,
    country              TEXT          NOT NULL DEFAULT 'USA',

    -- Stock levels
    quantity_available   INTEGER       NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    quantity_reserved    INTEGER       NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),

    -- Pricing
    unit_cost            NUMERIC(12,2) NOT NULL DEFAULT 0, -- procurement buying / holding cost
    target_sell_price    NUMERIC(12,2)          DEFAULT 0, -- benchmark price for Sales quotes

    -- Status (auto-managed by trigger below; don't set manually)
    status               TEXT          NOT NULL DEFAULT 'In Stock',

    -- Optional physical unit tracking
    unit_serial_numbers  TEXT[]                 DEFAULT '{}',

    notes                TEXT,

    -- Audit
    created_by           UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by           UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS inventory_container_size_idx       ON public.inventory (container_size);
CREATE INDEX IF NOT EXISTS inventory_container_condition_idx  ON public.inventory (container_condition);
CREATE INDEX IF NOT EXISTS inventory_depot_name_idx           ON public.inventory (depot_name);
CREATE INDEX IF NOT EXISTS inventory_vendor_supplier_idx      ON public.inventory (vendor_supplier);
CREATE INDEX IF NOT EXISTS inventory_status_idx               ON public.inventory (status);
CREATE INDEX IF NOT EXISTS inventory_created_by_idx           ON public.inventory (created_by);


-- --- 2. Auto-status trigger ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inventory_auto_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.quantity_available = 0 THEN
        NEW.status := 'Out of Stock';
    ELSIF NEW.quantity_available <= 2 THEN
        NEW.status := 'Low Stock';
    ELSE
        NEW.status := 'In Stock';
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_auto_status ON public.inventory;
CREATE TRIGGER trg_inventory_auto_status
    BEFORE INSERT OR UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.inventory_auto_status();


-- --- 3. Row-Level Security ---------------------------------------------------------------

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- 3a. All authenticated users can view the full inventory catalog
DROP POLICY IF EXISTS "Inventory viewable by all authenticated users" ON public.inventory;
CREATE POLICY "Inventory viewable by all authenticated users"
    ON public.inventory FOR SELECT
    TO authenticated
    USING (true);

-- 3b. Admin, Procurement, and Operations can create inventory records
DROP POLICY IF EXISTS "Inventory insertable by procurement, operations, and admin" ON public.inventory;
CREATE POLICY "Inventory insertable by procurement, operations, and admin"
    ON public.inventory FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'procurement', 'operations')
        )
    );

-- 3c. Admin can update any record; Procurement/Operations can only update their own records
DROP POLICY IF EXISTS "Inventory updatable by owner or admin" ON public.inventory;
CREATE POLICY "Inventory updatable by owner or admin"
    ON public.inventory FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role IN ('procurement', 'operations') AND public.inventory.created_by = auth.uid())
            )
        )
    );

-- 3d. Admin only can delete inventory records
DROP POLICY IF EXISTS "Inventory deletable by admin only" ON public.inventory;
CREATE POLICY "Inventory deletable by admin only"
    ON public.inventory FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );


-- --- 4. Bulk import RPC ------------------------------------------------------------------
-- Accepts a JSONB array of inventory rows (from Excel/CSV parsing on the frontend)
-- and inserts them in a single transaction. All rows are tagged with the actor's profile id.

CREATE OR REPLACE FUNCTION public.bulk_insert_inventory(
    p_actor_id UUID,
    p_rows     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role  TEXT;
    v_row         JSONB;
    v_imported    INTEGER := 0;
    v_errors      INTEGER := 0;
    v_error_rows  JSONB   := '[]'::JSONB;
BEGIN
    -- Gate: only admin, procurement, operations may bulk-import
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id;
    IF v_actor_role NOT IN ('admin', 'procurement', 'operations') THEN
        RAISE EXCEPTION 'Only admin, procurement, or operations users may import inventory.';
    END IF;

    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'Import payload must be a non-empty JSON array.';
    END IF;

    IF jsonb_array_length(p_rows) > 5000 THEN
        RAISE EXCEPTION 'Maximum 5,000 rows per import batch.';
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        BEGIN
            -- Require minimum fields
            IF (v_row->>'container_size') IS NULL OR trim(v_row->>'container_size') = '' THEN
                RAISE EXCEPTION 'container_size is required';
            END IF;
            IF (v_row->>'container_condition') IS NULL OR trim(v_row->>'container_condition') = '' THEN
                RAISE EXCEPTION 'container_condition is required';
            END IF;
            IF (v_row->>'depot_name') IS NULL OR trim(v_row->>'depot_name') = '' THEN
                RAISE EXCEPTION 'depot_name is required';
            END IF;

            INSERT INTO public.inventory (
                container_size,
                container_condition,
                container_category,
                vendor_supplier,
                depot_name,
                city,
                state_province,
                country,
                quantity_available,
                quantity_reserved,
                unit_cost,
                target_sell_price,
                unit_serial_numbers,
                notes,
                created_by,
                updated_by
            ) VALUES (
                trim(v_row->>'container_size'),
                trim(v_row->>'container_condition'),
                COALESCE(NULLIF(trim(v_row->>'container_category'), ''), 'Dry'),
                NULLIF(trim(COALESCE(v_row->>'vendor_supplier', '')), ''),
                trim(v_row->>'depot_name'),
                NULLIF(trim(COALESCE(v_row->>'city', '')), ''),
                NULLIF(trim(COALESCE(v_row->>'state_province', '')), ''),
                COALESCE(NULLIF(trim(v_row->>'country'), ''), 'USA'),
                GREATEST(0, COALESCE((v_row->>'quantity_available')::INTEGER, 0)),
                GREATEST(0, COALESCE((v_row->>'quantity_reserved')::INTEGER, 0)),
                GREATEST(0, COALESCE((v_row->>'unit_cost')::NUMERIC, 0)),
                GREATEST(0, COALESCE((v_row->>'target_sell_price')::NUMERIC, 0)),
                COALESCE(
                    ARRAY(SELECT jsonb_array_elements_text(v_row->'unit_serial_numbers')),
                    '{}'::TEXT[]
                ),
                NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
                p_actor_id,
                p_actor_id
            );

            v_imported := v_imported + 1;

        EXCEPTION WHEN OTHERS THEN
            v_errors    := v_errors + 1;
            v_error_rows := v_error_rows || jsonb_build_object(
                'row',   v_row,
                'error', SQLERRM
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'imported', v_imported,
        'errors',   v_errors,
        'error_rows', v_error_rows
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_insert_inventory(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_inventory(UUID, JSONB) TO service_role;


-- --- 5. Inventory summary view -----------------------------------------------------------
-- Used by the frontend KPI cards and Procurement's ticket cross-check widget.

CREATE OR REPLACE VIEW public.inventory_summary AS
SELECT
    COUNT(*)                                       AS total_records,
    COALESCE(SUM(quantity_available), 0)           AS total_available,
    COALESCE(SUM(quantity_reserved), 0)            AS total_reserved,
    COUNT(DISTINCT depot_name)                     AS active_depots,
    COUNT(DISTINCT vendor_supplier)                AS active_vendors,
    COUNT(*) FILTER (WHERE status = 'Low Stock')   AS low_stock_count,
    COUNT(*) FILTER (WHERE status = 'Out of Stock') AS out_of_stock_count
FROM public.inventory;

GRANT SELECT ON public.inventory_summary TO authenticated;
GRANT SELECT ON public.inventory_summary TO service_role;


-- --- 6. Stock availability lookup --------------------------------------------------------
-- Called by Procurement's InquiryValidation queue to show live yard counts for
-- a requested container size and condition.

CREATE OR REPLACE FUNCTION public.get_stock_for_spec(
    p_container_size      TEXT,
    p_container_condition TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_available', COALESCE(SUM(quantity_available), 0),
        'total_reserved',  COALESCE(SUM(quantity_reserved), 0),
        'depots', jsonb_agg(
            jsonb_build_object(
                'depot',     depot_name,
                'city',      city,
                'state',     state_province,
                'available', quantity_available,
                'reserved',  quantity_reserved,
                'vendor',    vendor_supplier,
                'status',    status
            ) ORDER BY quantity_available DESC
        )
    ) INTO v_result
    FROM public.inventory
    WHERE container_size      ILIKE p_container_size
    AND   container_condition ILIKE p_container_condition;

    RETURN COALESCE(v_result, jsonb_build_object(
        'total_available', 0,
        'total_reserved',  0,
        'depots',          '[]'::JSONB
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_for_spec(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_for_spec(TEXT, TEXT) TO service_role;


NOTIFY pgrst, 'reload schema';
