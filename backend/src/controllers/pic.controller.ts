import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class PicController {
  static async getPics(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('pics')
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
