import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class ContractController {
  
  static async listContracts(req: Request, res: Response) {
    try {
      const status = req.query.status as string; 
      const pickStatus = req.query.pickStatus as string;
      const search = req.query.search as string;

      let dbQuery = supabaseAdmin
        .from('contracts_view')
        .select('*');

      // 1. DATA SILOS ENFORCEMENT
      if (req.auth?.profile.role !== 'admin') {
        dbQuery = dbQuery.eq('pic_id', req.auth?.profile.pic_id);
      }

      // 2. STATUS FILTERING
      if (status && status !== 'All Statuses') {
        dbQuery = dbQuery.eq('contract_status', status);
      }
      
      if (pickStatus && pickStatus !== 'All Pickup Statuses') {
        dbQuery = dbQuery.eq('pickup_status', pickStatus);
      }

      // 3. SEARCH
      if (search) {
        dbQuery = dbQuery.or(`contract_number.ilike.%${search}%,company_name.ilike.%${search}%,sale_number.ilike.%${search}%`);
      }

      const { data, error } = await dbQuery.order('created_at', { ascending: false }).limit(1000);

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async createContract(req: Request, res: Response) {
    try {
      const { sale_id, pickup_date } = req.body;
      if (!sale_id) throw new Error('sale_id is required');

      // Verify the sale exists and belongs to the user (silos)
      let saleQuery = supabaseAdmin.from('sales').select('id, company_id, pic_id').eq('id', sale_id).single();
      const { data: sale, error: saleErr } = await saleQuery;
      if (saleErr || !sale) throw new Error('Sale not found');

      if (req.auth?.profile.role !== 'admin' && sale.pic_id !== req.auth?.profile.pic_id) {
        throw new Error('Unauthorized to create a contract for this sale');
      }

      const { data, error } = await supabaseAdmin.from('contracts').insert({
        sale_id,
        company_id: sale.company_id,
        pickup_date: pickup_date || null
      }).select('*').single();

      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
