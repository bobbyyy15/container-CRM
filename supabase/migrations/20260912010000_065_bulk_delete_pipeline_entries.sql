-- Deleting a large selection took one HTTP request per record, and each of those ran four
-- queries: fetch the row, check ownership, count each downstream link, then delete. Clearing
-- 17,000 prospects meant roughly 68,000 round trips and well over half an hour.
--
-- The same work is a handful of set operations. This does the ownership check, the
-- downstream-link check and the delete for a whole batch of ids at once, and reports how
-- many were deleted, how many were protected by a later stage, and how many were not the
-- caller's to delete -- so the answer a person sees is the same as before.
--
-- Ownership matches the per-record path: an admin may delete any row, a sales manager only
-- rows belonging to their own PIC.

CREATE OR REPLACE FUNCTION public.delete_pipeline_entries(
    p_stage TEXT,
    p_ids UUID[],
    p_actor_pic_id UUID,
    p_is_admin BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_requested INTEGER := COALESCE(array_length(p_ids, 1), 0);
    v_owned UUID[];
    v_blocked UUID[];
    v_deletable UUID[];
    v_deleted INTEGER := 0;
BEGIN
    IF v_requested = 0 THEN
        RETURN jsonb_build_object('requested', 0, 'deleted', 0, 'blocked', 0, 'notOwned', 0);
    END IF;
    IF v_requested > 5000 THEN
        RAISE EXCEPTION 'Delete at most 5000 records per call' USING ERRCODE = 'P0001';
    END IF;
    IF p_stage NOT IN ('prospects', 'warm-leads', 'inquiries') THEN
        RAISE EXCEPTION 'Cannot delete "%" records', p_stage USING ERRCODE = 'P0001';
    END IF;
    IF NOT p_is_admin AND p_actor_pic_id IS NULL THEN
        RAISE EXCEPTION 'Your account is not linked to a PIC' USING ERRCODE = 'P0001';
    END IF;

    IF p_stage = 'prospects' THEN
        SELECT array_agg(id) INTO v_owned FROM public.prospect_clients
        WHERE id = ANY(p_ids) AND (p_is_admin OR pic_id = p_actor_pic_id);

        -- A prospect that became a warm lead belongs to that stage now.
        SELECT array_agg(DISTINCT prospect.id) INTO v_blocked
        FROM public.prospect_clients prospect
        JOIN public.warm_leads warm ON warm.source_prospect_id = prospect.id
        WHERE prospect.id = ANY(COALESCE(v_owned, '{}'::UUID[]));

    ELSIF p_stage = 'warm-leads' THEN
        SELECT array_agg(id) INTO v_owned FROM public.warm_leads
        WHERE id = ANY(p_ids) AND (p_is_admin OR pic_id = p_actor_pic_id);

        SELECT array_agg(DISTINCT warm.id) INTO v_blocked
        FROM public.warm_leads warm
        JOIN public.inquiries inquiry ON inquiry.source_warm_lead_id = warm.id
        WHERE warm.id = ANY(COALESCE(v_owned, '{}'::UUID[]));

    ELSE
        SELECT array_agg(id) INTO v_owned FROM public.inquiries
        WHERE id = ANY(p_ids) AND (p_is_admin OR pic_id = p_actor_pic_id);

        SELECT array_agg(DISTINCT inquiry.id) INTO v_blocked
        FROM public.inquiries inquiry
        WHERE inquiry.id = ANY(COALESCE(v_owned, '{}'::UUID[]))
          AND (EXISTS (SELECT 1 FROM public.quotations quote WHERE quote.inquiry_id = inquiry.id)
            OR EXISTS (SELECT 1 FROM public.warm_leads warm WHERE warm.source_inquiry_id = inquiry.id));
    END IF;

    v_owned := COALESCE(v_owned, '{}'::UUID[]);
    v_blocked := COALESCE(v_blocked, '{}'::UUID[]);

    SELECT array_agg(id) INTO v_deletable
    FROM unnest(v_owned) AS id
    WHERE id <> ALL(v_blocked);
    v_deletable := COALESCE(v_deletable, '{}'::UUID[]);

    IF array_length(v_deletable, 1) > 0 THEN
        IF p_stage = 'prospects' THEN
            DELETE FROM public.prospect_clients WHERE id = ANY(v_deletable);
        ELSIF p_stage = 'warm-leads' THEN
            DELETE FROM public.warm_leads WHERE id = ANY(v_deletable);
        ELSE
            DELETE FROM public.inquiries WHERE id = ANY(v_deletable);
        END IF;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'requested', v_requested,
        'deleted', v_deleted,
        'blocked', COALESCE(array_length(v_blocked, 1), 0),
        'notOwned', v_requested - COALESCE(array_length(v_owned, 1), 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_pipeline_entries(TEXT, UUID[], UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pipeline_entries(TEXT, UUID[], UUID, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
