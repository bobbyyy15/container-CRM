import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class CatalogController {
  static async getSizes(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin.from('container_sizes').select('*').order('name');
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getConditions(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin.from('container_conditions').select('*').order('name');
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getCategories(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin.from('container_categories').select('*').order('name');
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
