import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { message: 'Missing or invalid authorization header' } });
    }

    const token = authHeader.split(' ')[1];

    // Verify token using Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } });
    }

    // Attach user to request
    (req as any).user = user;
    
    next();
  } catch (error: any) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
};
