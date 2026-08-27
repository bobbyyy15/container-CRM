import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { DealService } from '../services/deal.service';
import { CreateQuotationSchema, UpdateQuotationStatusSchema, ConvertToSaleSchema, CreateManualSaleSchema } from '../schemas/deal.schema';

export class DealController {
  
  static async getQuotations(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('quotations')
        .select('*, companies(*), contacts(*), pics(name), quotation_items(*)')
        .not('status', 'in', '(Converted,Rejected)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getSales(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('sales')
        .select('*, companies(*), pics(name), quotations(*, contacts(*), quotation_items(*))')
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
