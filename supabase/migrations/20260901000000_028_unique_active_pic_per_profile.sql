-- 028_unique_active_pic_per_profile.sql
--
-- Every "find this user's PIC" lookup (get_pic_id(), user_has_pipeline_access(), and
-- auth.middleware.ts's own query) does `WHERE profile_id = ... AND status = 'active' LIMIT 1`
-- with no ORDER BY, assuming there's at most one active PIC per profile. That assumption was
-- never enforced. With 025_auto_pic_creation.sql now creating a PIC automatically on signup
-- (on top of the admin's manual "Assign PIC" button, and any other insert path), two active
-- PIC rows for the same profile is now reachable -- and when it happens, two independent
-- LIMIT-1 lookups (one from the Node backend, one from inside a Postgres function) are not
-- guaranteed to resolve to the same row. That mismatch is silent and produces exactly the
-- kind of bug already seen once: an import stamps a row with PIC A while the list/search
-- endpoint filters by PIC B, so the freshly imported row appears to vanish.
--
-- Enforce the invariant the code already assumes instead of hoping it holds.
CREATE UNIQUE INDEX IF NOT EXISTS pics_one_active_per_profile
    ON public.pics (profile_id)
    WHERE status = 'active' AND profile_id IS NOT NULL;
