import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { CreateContractSchema, UpdateContractSchema } from '../schemas/contract.schema';

export class ContractController {
  
  static async listContracts(req: Request, res: Response) {
    try {
      const status = req.query.status as string; 
      const pickStatus = req.query.pickStatus as string;
      const search = req.query.search as string;

      // Contracts are operational fulfilment records, so visibility has to match the
      // update authorization in updateContract below: admin and operations manage any
      // contract regardless of which sales PIC owns the underlying sale, so they must
      // be able to SEE them too. Previously this filtered strictly by pic_id, which
      // left operations staring at an empty Pickup Tracking screen for contracts they
      // were explicitly allowed to update.
      const actorRole = req.auth?.profile.role;
      const picId = req.auth?.profile.pic_id;
      const seesAllContracts = actorRole === 'admin' || actorRole === 'operations';

      if (!seesAllContracts && !picId) return res.json({ success: true, data: [] });

      let dbQuery = supabaseAdmin
        .from('contracts_view')
        .select('*');

      if (!seesAllContracts) dbQuery = dbQuery.eq('pic_id', picId);

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
      const payload = CreateContractSchema.parse(req.body);
      const { sale_id, pickup_date, inventory_id, allocation_quantity } = payload;

      // Verify the sale exists and belongs to the user (silos)
      const saleQuery = supabaseAdmin.from('sales').select('id, company_id, pic_id, status').eq('id', sale_id).single();
      const { data: sale, error: saleErr } = await saleQuery;
      if (saleErr || !sale) throw new Error('Sale not found');

      // Mirrors the list/update rules: admin and operations raise contracts against any
      // sale, a sales_manager only against their own.
      const actorRole = req.auth?.profile.role;
      const canManageAnySale = actorRole === 'admin' || actorRole === 'operations';
      const ownsSale = Boolean(req.auth?.profile.pic_id) && sale.pic_id === req.auth!.profile.pic_id;

      if (!canManageAnySale && !ownsSale) {
        throw new Error('Unauthorized to create a contract for this sale');
      }
      if (sale.status !== 'Won') throw new Error('Only won sales can become contracts');

      const { data, error } = await supabaseAdmin.rpc('create_contract_with_inventory', {
        p_sale_id: sale_id,
        p_inventory_id: inventory_id,
        p_quantity: allocation_quantity,
        p_pickup_date: pickup_date ?? null,
        p_actor_id: req.auth!.profile.id,
      }).single();

      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payload = UpdateContractSchema.parse(req.body);

      // Verify the contract exists and belongs to the user
      let contractQuery = supabaseAdmin.from('contracts').select('id, sale_id, sales(pic_id)').eq('id', id).single();
      const { data: contract, error: contractErr } = await contractQuery;
      
      if (contractErr || !contract) throw new Error('Contract not found');

      // Pickup/contract status is operational data: admins and the operations team move it
      // for whoever owns the sale, so gate on role first and fall back to PIC ownership for
      // sales_manager users (who may only touch their own book).
      const saleData = Array.isArray(contract.sales) ? contract.sales[0] : contract.sales;
      const actorRole = req.auth?.profile.role;
      const canManageAnyContract = actorRole === 'admin' || actorRole === 'operations';
      const ownsContract = Boolean(req.auth?.profile.pic_id)
        && (saleData as any)?.pic_id === req.auth!.profile.pic_id;

      if (!canManageAnyContract && !ownsContract) {
        throw new Error('Unauthorized to update this contract');
      }

      const { data, error } = await supabaseAdmin.rpc('update_contract_lifecycle', {
        p_contract_id: id,
        p_actor_id: req.auth!.profile.id,
        p_pickup_status: payload.pickup_status ?? null,
        p_pickup_date: payload.pickup_date ?? null,
        p_set_pickup_date: Object.prototype.hasOwnProperty.call(payload, 'pickup_date'),
        p_status: payload.status ?? null,
      }).single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
