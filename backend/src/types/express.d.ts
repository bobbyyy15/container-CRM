import type { User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        user: User;
        profile: {
          id: string;
          role: 'admin' | 'sales_manager' | 'procurement' | 'operations';
          status: 'active' | 'inactive';
          pic_id: string | null;
        };
      };
    }
  }
}

export {};
