-- Migration 067 gave create_manual_sale four more parameters. In Postgres that creates an
-- OVERLOAD rather than replacing the function, so two versions existed and PostgREST
-- refused to call either: "Could not choose the best candidate function". Recording a sale
-- answered 500 until this drop.
--
-- Dropping by full signature leaves the new one in place.

DROP FUNCTION IF EXISTS public.create_manual_sale(
    UUID,      -- p_actor_id
    TEXT,      -- p_company_name
    TEXT,      -- p_contact_person
    TEXT,      -- p_phone
    TEXT,      -- p_email
    UUID,      -- p_pic_id
    INTEGER,   -- p_total_units
    NUMERIC,   -- p_buying_cost
    NUMERIC,   -- p_revenue
    TEXT,      -- p_state_province
    TEXT       -- p_country
);

NOTIFY pgrst, 'reload schema';
