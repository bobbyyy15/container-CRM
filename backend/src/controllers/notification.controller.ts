import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class NotificationController {
  static async list(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('profile_id', req.auth!.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json({ success: true, data, meta: { unread: (data ?? []).filter(n => !n.read).length } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .update({ read: true })
        .eq('id', req.params.id)
        .eq('profile_id', req.auth!.user.id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'Notification not found.' } });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async markAllRead(req: Request, res: Response) {
    try {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ read: true })
        .eq('profile_id', req.auth!.user.id)
        .eq('read', false);
      if (error) throw error;
      res.json({ success: true, data: null });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
