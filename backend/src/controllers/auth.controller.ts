import { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';

const ResolveLoginSchema = z.object({
  identifier: z.string().trim().min(1),
});

export class AuthController {
  // Supabase Auth only signs in by email (or phone), but this CRM lets people log in with
  // either their email or their username. Resolve a username to its email here, using the
  // service role -- profiles reads are authenticated-only, and this runs before login.
  static async resolveLogin(req: Request, res: Response) {
    try {
      const { identifier } = ResolveLoginSchema.parse(req.body);

      if (identifier.includes('@')) {
        return res.json({ success: true, data: { email: identifier } });
      }

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .ilike('username', identifier)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ success: false, error: { message: 'No account found for that username.' } });
      }

      res.json({ success: true, data: { email: data.email } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
