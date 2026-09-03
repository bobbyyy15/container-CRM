-- Report stock that can still be sold after active reservations. The original lookup
-- exposed physical quantity as "available", which made Procurement's validation view
-- overstate fulfillment capacity whenever contracts had reserved units.

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
        'total_sellable',  COALESCE(SUM(GREATEST(quantity_available - quantity_reserved, 0)), 0),
        'depots', COALESCE(jsonb_agg(
            jsonb_build_object(
                'depot',     depot_name,
                'city',      city,
                'state',     state_province,
                'available', quantity_available,
                'reserved',  quantity_reserved,
                'sellable',  GREATEST(quantity_available - quantity_reserved, 0),
                'vendor',    vendor_supplier,
                'status',    status
            ) ORDER BY GREATEST(quantity_available - quantity_reserved, 0) DESC
        ), '[]'::JSONB)
    ) INTO v_result
    FROM public.inventory
    WHERE container_size ILIKE p_container_size
      AND container_condition ILIKE p_container_condition;

    RETURN COALESCE(v_result, jsonb_build_object(
        'total_available', 0,
        'total_reserved',  0,
        'total_sellable',  0,
        'depots',          '[]'::JSONB
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_stock_for_spec(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_for_spec(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_for_spec(TEXT, TEXT) TO service_role;

