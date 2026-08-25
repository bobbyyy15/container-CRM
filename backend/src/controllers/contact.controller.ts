import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { CreateContactSchema, UpdateContactSchema } from '../schemas/contact.schema';

export class ContactController {
  static async getContacts(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getContact(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('*, companies(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'Contact not found' } });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async createContact(req: Request, res: Response) {
    try {
      const validatedData = CreateContactSchema.parse(req.body);

      // Normalization of phone and email could happen here before insert
      
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .insert(validatedData)
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateContact(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const validatedData = UpdateContactSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('contacts')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'Contact not found' } });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
