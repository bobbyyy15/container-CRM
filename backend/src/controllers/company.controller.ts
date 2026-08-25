import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { CreateCompanySchema, UpdateCompanySchema } from '../schemas/company.schema';

export class CompanyController {
  static async getCompanies(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getCompany(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { data, error } = await supabaseAdmin
        .from('companies')
        .select('*, contacts(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'Company not found' } });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async createCompany(req: Request, res: Response) {
    try {
      const validatedData = CreateCompanySchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('companies')
        .insert(validatedData)
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateCompany(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const validatedData = UpdateCompanySchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('companies')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'Company not found' } });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
