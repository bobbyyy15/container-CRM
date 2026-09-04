import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class CustomerController {
  
  static async listCustomers(req: Request, res: Response) {
    try {
      const status = req.query.status as string; // 'Active' or 'Floating' or 'All'
      const search = req.query.search as string;
      // The dashboard only renders a handful; without this it pulled the whole table
      // over the network and discarded almost all of it.
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 1000)
        : 1000;

      const actorRole = req.auth?.profile.role;
      const picId = req.auth?.profile.pic_id;
      const scope = req.query.scope as string; // 'personal' | 'master' | undefined
      const targetPicId = req.query.pic_id as string;
      const isSalesManager = actorRole === 'sales_manager';
      const effectivePicId = targetPicId || (isSalesManager ? picId : (scope === 'personal' ? picId : undefined));

      let dbQuery = supabaseAdmin
        .from('customer_accounts_view')
        .select('*');

      if (effectivePicId) {
        dbQuery = dbQuery.eq('pic_id', effectivePicId);
      } else if (isSalesManager && !picId) {
        return res.json({ success: true, data: [] });
      }

      // 2. STATUS FILTERING
      if (status && status !== 'All') {
        dbQuery = dbQuery.eq('status', status);
      }

      // 3. SEARCH
      if (search) {
        dbQuery = dbQuery.ilike('company_name', `%${search}%`);
      }

      const { data, error } = await dbQuery.order('total_revenue', { ascending: false }).limit(limit);

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
