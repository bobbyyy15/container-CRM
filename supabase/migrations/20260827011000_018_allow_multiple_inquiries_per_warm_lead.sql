-- Migration 017 removed the idempotency check that capped a Warm Lead at one Inquiry, but
-- a unique index from migration 008 still enforced the old one-inquiry-per-warm-lead rule at
-- the database level, so a second inquiry on the same warm lead failed with a unique
-- constraint violation. A Warm Lead may have multiple Inquiries over time.

DROP INDEX IF EXISTS public.inquiries_source_warm_lead_unique_idx;

NOTIFY pgrst, 'reload schema';
