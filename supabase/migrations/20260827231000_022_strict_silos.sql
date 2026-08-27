-- 022_strict_silos.sql
-- Remove the admin bypass from pipeline data so Admins cannot see what Sales Managers imported.

CREATE OR REPLACE FUNCTION public.user_has_pipeline_access(p_pic_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_user_pic_id UUID;
BEGIN
    SELECT id INTO v_user_pic_id FROM public.pics WHERE profile_id = auth.uid() AND status = 'active' LIMIT 1;
    RETURN p_pic_id = v_user_pic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
