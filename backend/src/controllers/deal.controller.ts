import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { DealService } from '../services/deal.service';
import { CreateQuotationSchema, UpdateQuotationStatusSchema, ConvertToSaleSchema, CreateManualSaleSchema } from '../schemas/deal.schema';

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
        .not('status', 'in', '(Converted,Rejected)')
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
      if (!picId) return res.json({ success: true, data: [] });

      const { data, error } = await supabaseAdmin
        .from('sales')
        .select('*, companies(*), pics(name), quotations(*, contacts(*), quotation_items(*))')
        .eq('pic_id', picId)
        .order('created_at', { ascending: false });

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
}
