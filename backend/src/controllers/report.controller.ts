import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class ReportController {

  // GET /api/v1/reports/monthly?month=YYYY-MM
  static async monthly(req: Request, res: Response) {
    try {
      const month = String(req.query.month ?? '');
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ success: false, error: { message: 'month must be in YYYY-MM format.' } });
      }

      // Same scoping rule as the dashboard: admins see the whole org, everyone else
      // sees only their own PIC's book.
      const isAdmin = req.auth?.profile.role === 'admin';
      const picId = req.auth?.profile.pic_id ?? null;

      const { data, error } = await supabaseAdmin.rpc('get_monthly_report', {
        p_month_start: `${month}-01`,
        p_pic_id: isAdmin ? null : picId,
      });
      if (error) throw error;

      res.json({ success: true, data: { ...data, scope: isAdmin ? 'organization' : 'personal' } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  }
}
