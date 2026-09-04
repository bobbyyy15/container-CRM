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

      // Two different views of the same data, by design:
      //   * a sales_manager sees only their own book -- their active clients
      //   * operations (and admin) see the compiled roll-up of every account's
      //     active clients, which is what the Customer Accounts screen is for
      const actorRole = req.auth?.profile.role;
      const picId = req.auth?.profile.pic_id;
      const seesAllAccounts = actorRole === 'admin' || actorRole === 'operations';

      if (!seesAllAccounts && !picId) return res.json({ success: true, data: [] });

      let dbQuery = supabaseAdmin
        .from('customer_accounts_view')
        .select('*');

      if (!seesAllAccounts) dbQuery = dbQuery.eq('pic_id', picId);

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
