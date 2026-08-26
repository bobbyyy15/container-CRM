import { Request, Response } from 'express';
import { getGoogleOAuthConfig } from '../config/env';
import { GoogleOAuthService } from '../services/google-oauth.service';

const queryValue = (value: unknown) => typeof value === 'string' ? value : null;

export class GoogleAuthController {
  static async status(req: Request, res: Response) {
    try {
      const status = await GoogleOAuthService.getStatus(req.auth!.user.id);
      res.json({ success: true, data: status, requestId: req.requestId });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GOOGLE_STATUS_FAILED', message: error.message },
        requestId: req.requestId,
      });
    }
  }

  static async getAuthUrl(req: Request, res: Response) {
    try {
      const url = await GoogleOAuthService.createAuthorizationUrl(req.auth!.user.id);
      res.json({ success: true, data: { url }, requestId: req.requestId });
    } catch (error: any) {
      res.status(503).json({
        success: false,
        error: { code: 'GOOGLE_OAUTH_UNAVAILABLE', message: error.message },
        requestId: req.requestId,
      });
    }
  }

  static async callback(req: Request, res: Response) {
    const code = queryValue(req.query.code);
    const state = queryValue(req.query.state);
    const googleError = queryValue(req.query.error);

    try {
      const { frontendUrl } = getGoogleOAuthConfig();
      const redirect = new URL(frontendUrl);

      if (googleError) {
        redirect.searchParams.set('google_sync', 'cancelled');
        return res.redirect(redirect.toString());
      }

      if (!code || !state) {
        return res.status(400).send('Missing Google authorization code or state.');
      }

      await GoogleOAuthService.completeAuthorization(code, state);
      redirect.searchParams.set('google_sync', 'success');
      return res.redirect(redirect.toString());
    } catch (error: any) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'google_oauth_callback_failed',
        requestId: req.requestId,
        message: error.message,
      }));
      return res.status(400).send(`Google connection failed. Request ID: ${req.requestId}`);
    }
  }

  static async disconnect(req: Request, res: Response) {
    try {
      await GoogleOAuthService.disconnect(req.auth!.user.id);
      res.json({ success: true, data: { connected: false }, requestId: req.requestId });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GOOGLE_DISCONNECT_FAILED', message: error.message },
        requestId: req.requestId,
      });
    }
  }
}
