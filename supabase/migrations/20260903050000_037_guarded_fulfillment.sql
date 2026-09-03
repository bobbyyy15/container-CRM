-- 037_guarded_fulfillment.sql
-- Constrain pipeline lifecycle values and make contract fulfilment reserve and consume stock.

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_status_valid CHECK (status IN (
    'Pending Validation', 'Under Review', 'Validation Rejected', 'Quotation Created',
    'Quotation Rejected', 'Converted to Sale', 'Removed', 'Lost'
  )) NOT VALID;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_valid CHECK (status IN ('Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Converted')) NOT VALID;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_status_valid CHECK (status IN ('Pending', 'Won')) NOT VALID;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_valid CHECK (status IN ('Pending Signature', 'Active', 'Completed', 'Cancelled')) NOT VALID;
UPDATE public.contracts SET pickup_status = 'Pending' WHERE pickup_status IS NULL;
ALTER TABLE public.contracts ALTER COLUMN pickup_status SET NOT NULL;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_pickup_status_valid CHECK (pickup_status IN ('Pending', 'Scheduled', 'Confirmed', 'Picked Up')) NOT VALID;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_reservation_valid CHECK (quantity_reserved <= quantity_available) NOT VALID;

CREATE TABLE public.contract_inventory_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, inventory_id)
);

CREATE INDEX contract_inventory_allocations_inventory_idx
  ON public.contract_inventory_allocations(inventory_id);

ALTER TABLE public.contract_inventory_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contract allocations follow contract visibility"
  ON public.contract_inventory_allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c JOIN public.sales s ON s.id = c.sale_id
    WHERE c.id = contract_id AND public.user_has_pipeline_access(s.pic_id)
  ));
REVOKE ALL ON public.contract_inventory_allocations FROM anon, authenticated;
GRANT SELECT ON public.contract_inventory_allocations TO authenticated;
GRANT ALL ON public.contract_inventory_allocations TO service_role;

-- Inventory status describes sellable stock, not merely physical stock in the yard.
CREATE OR REPLACE FUNCTION public.inventory_auto_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_sellable INTEGER;
BEGIN
  v_sellable := NEW.quantity_available - NEW.quantity_reserved;
  IF v_sellable <= 0 THEN NEW.status := 'Out of Stock';
  ELSIF v_sellable <= 2 THEN NEW.status := 'Low Stock';
  ELSE NEW.status := 'In Stock';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_quotation_status(
  p_quotation_id UUID, p_actor_id UUID, p_status TEXT
)
RETURNS SETOF public.quotations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_quotation public.quotations%ROWTYPE;
BEGIN
  SELECT * INTO v_quotation FROM public.quotations WHERE id = p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'P0002'; END IF;
  IF p_status NOT IN ('Sent', 'Viewed', 'Accepted', 'Rejected') THEN
    RAISE EXCEPTION 'Unsupported quotation status' USING ERRCODE = 'P0001';
  END IF;
  IF v_quotation.status IN ('Converted', 'Rejected') THEN
    RAISE EXCEPTION '% quotations cannot be modified', v_quotation.status USING ERRCODE = 'P0001';
  END IF;
  IF p_status <> v_quotation.status AND NOT (
    (v_quotation.status = 'Draft' AND p_status IN ('Sent', 'Accepted', 'Rejected')) OR
    (v_quotation.status = 'Sent' AND p_status IN ('Viewed', 'Accepted', 'Rejected')) OR
    (v_quotation.status = 'Viewed' AND p_status IN ('Accepted', 'Rejected')) OR
    (v_quotation.status = 'Accepted' AND p_status = 'Rejected')
  ) THEN
    RAISE EXCEPTION 'Invalid quotation transition from % to %', v_quotation.status, p_status USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.quotations SET status = p_status WHERE id = p_quotation_id RETURNING * INTO v_quotation;
  IF p_status = 'Rejected' AND v_quotation.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries SET status = 'Quotation Rejected' WHERE id = v_quotation.inquiry_id;
  END IF;
  INSERT INTO public.domain_events(entity_type, entity_id, event_type, actor_id, payload)
  VALUES ('quotation', v_quotation.id, lower('quotation_' || p_status), p_actor_id, jsonb_build_object('status', p_status));
  RETURN NEXT v_quotation;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_contract_with_inventory(
  p_sale_id UUID, p_inventory_id UUID, p_quantity INTEGER, p_pickup_date TIMESTAMPTZ, p_actor_id UUID
)
RETURNS SETOF public.contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sale public.sales%ROWTYPE; v_stock public.inventory%ROWTYPE; v_contract public.contracts%ROWTYPE; v_allocated INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Allocation quantity must be at least 1' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0002'; END IF;
  IF v_sale.status <> 'Won' THEN RAISE EXCEPTION 'Only won sales can become contracts' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(sum(a.quantity), 0)::INTEGER INTO v_allocated
  FROM public.contract_inventory_allocations a JOIN public.contracts c ON c.id = a.contract_id
  WHERE c.sale_id = p_sale_id AND c.status <> 'Cancelled';
  IF v_allocated + p_quantity > v_sale.total_units THEN RAISE EXCEPTION 'Allocation exceeds the uncontracted sale quantity' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_stock FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory record not found' USING ERRCODE = 'P0002'; END IF;
  IF v_stock.quantity_available - v_stock.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock; only % unit(s) remain', v_stock.quantity_available - v_stock.quantity_reserved USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.contracts(sale_id, company_id, pickup_date, pickup_status)
  VALUES (v_sale.id, v_sale.company_id, p_pickup_date, CASE WHEN p_pickup_date IS NULL THEN 'Pending' ELSE 'Scheduled' END)
  RETURNING * INTO v_contract;
  INSERT INTO public.contract_inventory_allocations(contract_id, inventory_id, quantity, created_by)
  VALUES (v_contract.id, v_stock.id, p_quantity, p_actor_id);
  UPDATE public.inventory SET quantity_reserved = quantity_reserved + p_quantity, updated_by = p_actor_id WHERE id = v_stock.id;
  INSERT INTO public.domain_events(entity_type, entity_id, event_type, actor_id, payload)
  VALUES ('contract', v_contract.id, 'contract_created', p_actor_id,
    jsonb_build_object('inventory_id', p_inventory_id, 'quantity', p_quantity));
  RETURN NEXT v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_contract_lifecycle(
  p_contract_id UUID, p_actor_id UUID, p_pickup_status TEXT DEFAULT NULL,
  p_pickup_date TIMESTAMPTZ DEFAULT NULL, p_set_pickup_date BOOLEAN DEFAULT FALSE,
  p_status TEXT DEFAULT NULL
)
RETURNS SETOF public.contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_contract public.contracts%ROWTYPE; v_next_pickup TEXT; v_next_status TEXT; v_effective_date TIMESTAMPTZ; v_allocation RECORD;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found' USING ERRCODE = 'P0002'; END IF;
  v_next_pickup := COALESCE(p_pickup_status, v_contract.pickup_status);
  v_next_status := COALESCE(p_status, v_contract.status);
  v_effective_date := CASE WHEN p_set_pickup_date THEN p_pickup_date ELSE v_contract.pickup_date END;
  IF v_contract.pickup_status = 'Picked Up' AND v_next_pickup <> 'Picked Up' THEN RAISE EXCEPTION 'Picked-up contracts cannot return to an earlier pickup state' USING ERRCODE = 'P0001'; END IF;
  IF v_contract.status IN ('Completed', 'Cancelled') AND v_next_status <> v_contract.status THEN RAISE EXCEPTION '% contracts are immutable', v_contract.status USING ERRCODE = 'P0001'; END IF;
  IF v_next_pickup NOT IN ('Pending', 'Scheduled', 'Confirmed', 'Picked Up') THEN RAISE EXCEPTION 'Unsupported pickup status' USING ERRCODE = 'P0001'; END IF;
  IF v_next_status NOT IN ('Pending Signature', 'Active', 'Completed', 'Cancelled') THEN RAISE EXCEPTION 'Unsupported contract status' USING ERRCODE = 'P0001'; END IF;
  IF v_next_pickup IN ('Scheduled', 'Confirmed', 'Picked Up') AND v_effective_date IS NULL THEN RAISE EXCEPTION 'A pickup date is required for this status' USING ERRCODE = 'P0001'; END IF;
  IF p_pickup_status IS NOT NULL AND p_pickup_status <> v_contract.pickup_status AND NOT (
    (v_contract.pickup_status = 'Pending' AND p_pickup_status = 'Scheduled') OR
    (v_contract.pickup_status = 'Scheduled' AND p_pickup_status IN ('Confirmed', 'Pending')) OR
    (v_contract.pickup_status = 'Confirmed' AND p_pickup_status IN ('Scheduled', 'Picked Up'))
  ) THEN RAISE EXCEPTION 'Invalid pickup transition from % to %', v_contract.pickup_status, p_pickup_status USING ERRCODE = 'P0001'; END IF;
  IF p_status IS NOT NULL AND p_status <> v_contract.status AND NOT (
    (v_contract.status = 'Pending Signature' AND p_status IN ('Active', 'Cancelled')) OR
    (v_contract.status = 'Active' AND p_status IN ('Completed', 'Cancelled'))
  ) THEN RAISE EXCEPTION 'Invalid contract transition from % to %', v_contract.status, p_status USING ERRCODE = 'P0001'; END IF;
  IF v_next_status = 'Completed' AND v_next_pickup <> 'Picked Up' THEN RAISE EXCEPTION 'A contract can only complete after pickup' USING ERRCODE = 'P0001'; END IF;
  IF v_next_status = 'Cancelled' AND v_next_pickup = 'Picked Up' THEN RAISE EXCEPTION 'A fulfilled contract cannot be cancelled' USING ERRCODE = 'P0001'; END IF;
  IF v_next_pickup IN ('Confirmed', 'Picked Up') AND v_next_status NOT IN ('Active', 'Completed') THEN RAISE EXCEPTION 'Activate the contract before confirming or completing pickup' USING ERRCODE = 'P0001'; END IF;

  IF v_contract.pickup_status <> 'Picked Up' AND v_next_pickup = 'Picked Up' THEN
    FOR v_allocation IN SELECT * FROM public.contract_inventory_allocations WHERE contract_id = p_contract_id AND fulfilled_at IS NULL AND released_at IS NULL FOR UPDATE LOOP
      UPDATE public.inventory SET quantity_available = quantity_available - v_allocation.quantity,
        quantity_reserved = quantity_reserved - v_allocation.quantity, updated_by = p_actor_id WHERE id = v_allocation.inventory_id;
      UPDATE public.contract_inventory_allocations SET fulfilled_at = NOW() WHERE id = v_allocation.id;
    END LOOP;
  ELSIF v_contract.status <> 'Cancelled' AND v_next_status = 'Cancelled' THEN
    FOR v_allocation IN SELECT * FROM public.contract_inventory_allocations WHERE contract_id = p_contract_id AND fulfilled_at IS NULL AND released_at IS NULL FOR UPDATE LOOP
      UPDATE public.inventory SET quantity_reserved = quantity_reserved - v_allocation.quantity, updated_by = p_actor_id WHERE id = v_allocation.inventory_id;
      UPDATE public.contract_inventory_allocations SET released_at = NOW() WHERE id = v_allocation.id;
    END LOOP;
  END IF;
  UPDATE public.contracts SET pickup_status = v_next_pickup, pickup_date = v_effective_date, status = v_next_status
  WHERE id = p_contract_id RETURNING * INTO v_contract;
  INSERT INTO public.domain_events(entity_type, entity_id, event_type, actor_id, payload)
  VALUES ('contract', v_contract.id, 'contract_updated', p_actor_id,
    jsonb_build_object('status', v_contract.status, 'pickup_status', v_contract.pickup_status, 'pickup_date', v_contract.pickup_date));
  RETURN NEXT v_contract;
END;
$$;

CREATE OR REPLACE VIEW public.contracts_view AS
SELECT c.id, c.contract_number, c.status AS contract_status, c.pickup_date,
  CASE WHEN c.status <> 'Cancelled' AND c.pickup_status <> 'Picked Up' AND c.pickup_date < NOW() THEN 'Overdue' ELSE c.pickup_status END AS pickup_status,
  c.created_at, s.id AS sale_id, s.sale_number, s.pic_id, s.total_units, s.revenue,
  p.name AS pic_name, comp.name AS company_name,
  (SELECT row_to_json(cont.*) FROM public.contacts cont JOIN public.company_contacts cc ON cc.contact_id = cont.id
   WHERE cc.company_id = comp.id AND cc.is_primary = true LIMIT 1) AS primary_contact,
  (SELECT jsonb_agg(jsonb_build_object('description', qi.description)) FROM public.quotation_items qi WHERE qi.quotation_id = s.quotation_id) AS items,
  a.inventory_id, a.quantity AS allocated_quantity,
  concat_ws(' · ', i.container_size, i.container_condition, i.depot_name) AS inventory_label,
  c.pickup_status AS stored_pickup_status
FROM public.contracts c
JOIN public.sales s ON s.id = c.sale_id
JOIN public.companies comp ON comp.id = s.company_id
LEFT JOIN public.pics p ON p.id = s.pic_id
LEFT JOIN LATERAL (SELECT cia.inventory_id, cia.quantity FROM public.contract_inventory_allocations cia WHERE cia.contract_id = c.id LIMIT 1) a ON TRUE
LEFT JOIN public.inventory i ON i.id = a.inventory_id;

REVOKE ALL ON FUNCTION public.create_contract_with_inventory(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_contract_lifecycle(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_with_inventory(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_contract_lifecycle(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) TO service_role;
GRANT SELECT ON public.contracts_view TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
