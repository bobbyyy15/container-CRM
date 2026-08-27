import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UpdateUserSchema } from '../schemas/admin.schema';

export class AdminController {
  static async listUsers(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, username, full_name, role, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const targetId = req.params.id as string;
      const payload = UpdateUserSchema.parse(req.body);

      // An admin locking themselves out (demoting their own role, or deactivating their own
      // account) is a real support headache with no self-service recovery -- require a
      // different admin to make that change instead.
      if (targetId === req.auth!.user.id) {
        throw new Error('Use a different admin account to change your own role or status.');
      }

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('id', targetId)
        .select('id, email, username, full_name, role, status, created_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: { message: 'User not found.' } });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
