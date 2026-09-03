import type { NextFunction, Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from './config/env';
import { supabaseAdmin } from './config/supabase';

export type CrmChangedEvent = {
  resource: string;
  method: string;
  at: string;
};

let io: Server | null = null;

export const attachRealtime = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
      if (!token) return next(new Error('Authentication required'));

      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !user) return next(new Error('Invalid or expired access token'));

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role, status')
        .eq('id', user.id)
        .maybeSingle();
      const supportedRoles = ['admin', 'sales_manager', 'procurement', 'operations'];
      if (profileError || !profile || profile.status !== 'active' || !supportedRoles.includes(profile.role)) {
        return next(new Error('CRM profile is unavailable'));
      }

      const { data: pic } = await supabaseAdmin
        .from('pics')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .maybeSingle();

      socket.data.profileId = profile.id;
      socket.data.role = profile.role;
      socket.data.picId = pic?.id ?? null;
      socket.join('authenticated');
      socket.join(`profile:${profile.id}`);
      if (pic?.id) socket.join(`pic:${pic.id}`);
      next();
    } catch {
      next(new Error('Socket authentication failed'));
    }
  });

  return io;
};

// Publish only an invalidation signal. Clients still retrieve the changed data through
// authenticated HTTP endpoints, preserving every existing role and PIC filter.
export const publishMutation = (req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const match = req.originalUrl.split('?')[0]?.match(/^\/api\/v1\/([^/]+)/);
    const resource = match?.[1];
    if (!resource || resource === 'auth' || resource === 'export') return;
    io?.to('authenticated').emit('crm:changed', {
      resource,
      method: req.method,
      at: new Date().toISOString(),
    } satisfies CrmChangedEvent);
  });

  next();
};
