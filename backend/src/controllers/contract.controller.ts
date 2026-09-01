import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class ContractController {
  
  static async listContracts(req: Request, res: Response) {
    try {
      const status = req.query.status as string; 
      const pickStatus = req.query.pickStatus as string;
      const search = req.query.search as string;

      // DATA SILOS ENFORCEMENT -- consistent with every other pipeline module: no PIC
      // assigned (including every admin, by design) means nothing to see.
      const picId = req.auth?.profile.pic_id;
      if (!picId) return res.json({ success: true, data: [] });

      let dbQuery = supabaseAdmin
        .from('contracts_view')
        .select('*')
        .eq('pic_id', picId);

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

      if (!req.auth?.profile.pic_id || sale.pic_id !== req.auth.profile.pic_id) {
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

  static async updateContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { pickup_status, pickup_date, status } = req.body;

      // Verify the contract exists and belongs to the user
      let contractQuery = supabaseAdmin.from('contracts').select('id, sale_id, sales(pic_id)').eq('id', id).single();
      const { data: contract, error: contractErr } = await contractQuery;
      
      if (contractErr || !contract) throw new Error('Contract not found');

      const saleData = Array.isArray(contract.sales) ? contract.sales[0] : contract.sales;
      if (!req.auth?.profile.pic_id || (saleData as any)?.pic_id !== req.auth.profile.pic_id) {
        throw new Error('Unauthorized to update this contract');
      }

      const updates: any = {};
      if (pickup_status) updates.pickup_status = pickup_status;
      if (pickup_date !== undefined) updates.pickup_date = pickup_date || null;
      if (status) updates.status = status;

      const { data, error } = await supabaseAdmin.from('contracts').update(updates).eq('id', id).select('*').single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
