import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { DealService } from '../services/deal.service';
import { CreateQuotationSchema, UpdateQuotationStatusSchema, ConvertToSaleSchema, CreateManualSaleSchema, UpdateSaleStatusSchema } from '../schemas/deal.schema';

// A record created with no PIC stamped on it is invisible under the pic_id-based data
// silos (NULL never equals NULL for row-ownership checks), so it becomes unreachable the
// moment it's created. Refuse to create it instead of losing it silently.
const requirePicId = (req: Request, res: Response): string | null => {
  const picId = req.auth?.profile.pic_id;
  if (!picId) {
    res.status(400).json({
      success: false,
      error: { message: 'You must be assigned a PIC identity by an admin before creating pipeline records.' },
    });
    return null;
  }
  return picId;
};

export class DealController {

  static async getQuotations(req: Request, res: Response) {
    try {
      // DATA SILOS ENFORCEMENT -- no PIC assigned (including every admin) means nothing to
      // see; .eq('pic_id', null) is not a valid NULL check in PostgREST and would error.
      const picId = req.auth?.profile.pic_id;
      if (!picId) return res.json({ success: true, data: [] });

      const { data, error } = await supabaseAdmin
        .from('quotations')
        .select('*, companies(*), contacts(*), pics(name), quotation_items(*)')
        .eq('pic_id', picId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getSales(req: Request, res: Response) {
    try {
      const picId = req.auth?.profile.pic_id;
      const seesAllSales = ['admin', 'operations'].includes(req.auth?.profile.role ?? '');
      if (!seesAllSales && !picId) return res.json({ success: true, data: [] });

      let query = supabaseAdmin
        .from('sales')
        // A manually recorded sale has no quotation, so the contact cannot come from
        // quotations(...) alone -- it rendered blank in Sales Tracker even when the
        // company had a contact on file. Embed the company's contacts as a fallback.
        .select('*, companies(*, company_contacts(is_primary, contacts(*))), pics(name), quotations(*, contacts(*), quotation_items(*))')
        .order('created_at', { ascending: false });
      if (!seesAllSales) query = query.eq('pic_id', picId!);
      const { data, error } = await query;

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async createQuotation(req: Request, res: Response) {
    try {
      const payload = CreateQuotationSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const quote = await DealService.createQuotation(payload, userId);
      res.status(201).json({ success: true, data: quote });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateQuotationStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const payload = UpdateQuotationStatusSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const quote = await DealService.updateQuotationStatus(id, payload, userId);
      res.json({ success: true, data: quote });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualSale(req: Request, res: Response) {
    try {
      const payload = CreateManualSaleSchema.parse(req.body);
      const userId = req.auth!.user.id;

      // DATA SILOS ENFORCEMENT
      const picId = requirePicId(req, res);
      if (!picId) return;
      payload.picId = picId;

      const sale = await DealService.createManualSale(payload, userId);
      res.status(201).json({ success: true, data: sale });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async convertToSale(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const payload = ConvertToSaleSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const sale = await DealService.convertToSale(id, payload, userId);
      res.status(201).json({ success: true, data: sale });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateSaleStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { status } = UpdateSaleStatusSchema.parse(req.body);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('sales')
        .select('id, pic_id')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Sale not found.' } });
      if (req.auth?.profile.role === 'sales_manager'
        && (!req.auth.profile.pic_id || existing.pic_id !== req.auth.profile.pic_id)) {
        return res.status(403).json({ success: false, error: { message: 'You can only update Sales owned by your own PIC.' } });
      }

      const { data, error } = await supabaseAdmin
        .from('sales')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, companies(*), pics(name)')
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async deleteSale(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('sales')
        .select('id, pic_id')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Sale not found.' } });
      if (req.auth?.profile.role === 'sales_manager'
        && (!req.auth.profile.pic_id || existing.pic_id !== req.auth.profile.pic_id)) {
        return res.status(403).json({ success: false, error: { message: 'You can only delete Sales owned by your own PIC.' } });
      }

      const { count: contractCount, error: contractError } = await supabaseAdmin
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('sale_id', id);
      if (contractError) throw contractError;
      if ((contractCount ?? 0) > 0) {
        return res.status(409).json({
          success: false,
          error: { message: 'This Sale has a Contract and cannot be deleted.' },
        });
      }

      const { error } = await supabaseAdmin
        .from('sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true, message: 'Sale deleted successfully.' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
