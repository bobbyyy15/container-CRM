import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class CustomerController {
  
  static async listCustomers(req: Request, res: Response) {
    try {
      const status = req.query.status as string; // 'Active' or 'Floating' or 'All'
      const search = req.query.search as string;

      // DATA SILOS ENFORCEMENT -- consistent with every other pipeline module: no PIC
      // assigned (including every admin, by design) means nothing to see.
      const picId = req.auth?.profile.pic_id;
      if (!picId) return res.json({ success: true, data: [] });

      let dbQuery = supabaseAdmin
        .from('customer_accounts_view')
        .select('*')
        .eq('pic_id', picId);

      // 2. STATUS FILTERING
      if (status && status !== 'All') {
        dbQuery = dbQuery.eq('status', status);
      }

      // 3. SEARCH
      if (search) {
        dbQuery = dbQuery.ilike('company_name', `%${search}%`);
      }

      const { data, error } = await dbQuery.order('total_revenue', { ascending: false }).limit(1000);

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
