import { Request, Response } from 'express';
import { google } from 'googleapis';
import { supabaseAdmin } from '../config/supabase';

// In production, these should come from process.env
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

export class GoogleAuthController {
  
  static async getAuthUrl(req: Request, res: Response) {
    const userId = (req as any).user.id;
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to get a refresh token
      prompt: 'consent', // Force consent screen to ensure we get a refresh token
      scope: scopes,
      state: userId // Pass the CRM user ID in state so we know who they are when they return
    });

    res.json({ success: true, url });
  }

  static async callback(req: Request, res: Response) {
    try {
      const { code, state } = req.query;
      const userId = state as string;

      if (!code || !userId) {
        return res.status(400).send("Missing code or user state");
      }

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);
      
      if (!tokens.refresh_token) {
        return res.status(400).send("No refresh token received. You may need to revoke access and try again.");
      }

      // Set credentials to get the user's email
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      // Save refresh token and email to Supabase profiles
      await supabaseAdmin
        .from('profiles')
        .update({
          google_refresh_token: tokens.refresh_token,
          google_email: userInfo.data.email
        })
        .eq('id', userId);

      // Redirect back to the CRM frontend
      res.redirect('http://localhost:8443?google_sync=success');
    } catch (error: any) {
      console.error('Google Auth Error:', error);
      res.status(500).send("Failed to connect Google account.");
    }
  }
}
