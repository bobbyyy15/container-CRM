import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

type OperationalRole = 'admin' | 'manager' | 'pic';

const authError = (
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
) => res.status(status).json({
  success: false,
  error: { code, message },
  requestId: req.requestId,
});

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      return authError(req, res, 401, 'AUTH_HEADER_MISSING', 'Missing or invalid authorization header.');
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(match[1]);
    if (userError || !user) {
      return authError(req, res, 401, 'AUTH_TOKEN_INVALID', 'Invalid or expired access token.');
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return authError(req, res, 403, 'PROFILE_NOT_FOUND', 'No CRM profile is associated with this account.');
    }

    if (profile.status !== 'active') {
      return authError(req, res, 403, 'PROFILE_INACTIVE', 'This CRM account is inactive.');
    }

    const role = profile.role;
    if (!['admin', 'manager', 'pic'].includes(role)) {
      return authError(req, res, 403, 'ROLE_INVALID', 'This account does not have a supported CRM role.');
    }

    req.auth = {
      user,
      profile: {
        id: profile.id,
        role: role as OperationalRole,
        status: 'active',
      },
    };

    next();
  } catch {
    return authError(req, res, 401, 'AUTH_FAILED', 'Unable to authenticate this request.');
  }
};

export const requireRoles = (...roles: OperationalRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.profile.role)) {
      return authError(req, res, 403, 'ROLE_FORBIDDEN', 'You do not have permission to perform this action.');
    }
    next();
  };
