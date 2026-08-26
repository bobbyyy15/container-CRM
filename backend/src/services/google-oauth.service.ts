import crypto from 'node:crypto';
import { google } from 'googleapis';
import { getGoogleOAuthConfig, isGoogleOAuthConfigured } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

const STATE_TTL_MINUTES = 10;

const createOAuthClient = () => {
  const config = getGoogleOAuthConfig();
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
};

export const hashOAuthState = (state: string) =>
  crypto.createHash('sha256').update(state).digest('hex');

export const createOAuthState = () => crypto.randomBytes(32).toString('base64url');

export class GoogleOAuthService {
  static async getStatus(userId: string) {
    if (!isGoogleOAuthConfigured()) {
      return { configured: false, connected: false, email: null };
    }

    const { data, error } = await supabaseAdmin
      .from('google_oauth_credentials')
      .select('google_email')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`Unable to read Google connection status: ${error.message}`);

    return {
      configured: true,
      connected: Boolean(data),
      email: data?.google_email ?? null,
    };
  }

  static async createAuthorizationUrl(userId: string) {
    const state = createOAuthState();
    const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60_000).toISOString();

    const { error } = await supabaseAdmin.from('google_oauth_states').insert({
      state_hash: hashOAuthState(state),
      user_id: userId,
      expires_at: expiresAt,
    });

    if (error) throw new Error(`Unable to create Google authorization request: ${error.message}`);

    return createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state,
    });
  }

  static async completeAuthorization(code: string, state: string) {
    const now = new Date().toISOString();
    const { data: consumedState, error: stateError } = await supabaseAdmin
      .from('google_oauth_states')
      .update({ consumed_at: now })
      .eq('state_hash', hashOAuthState(state))
      .is('consumed_at', null)
      .gt('expires_at', now)
      .select('user_id')
      .maybeSingle();

    if (stateError || !consumedState) {
      throw new Error('The Google authorization request is invalid, expired, or has already been used.');
    }

    const oauthClient = createOAuthClient();
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email;

    if (!googleEmail) throw new Error('Google did not return an email address.');

    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await supabaseAdmin
        .from('google_oauth_credentials')
        .select('refresh_token')
        .eq('user_id', consumedState.user_id)
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? null;
    }

    if (!refreshToken) {
      throw new Error('Google did not return a refresh token. Revoke the app in Google Account settings and reconnect.');
    }

    const { error: credentialError } = await supabaseAdmin
      .from('google_oauth_credentials')
      .upsert({
        user_id: consumedState.user_id,
        google_email: googleEmail,
        refresh_token: refreshToken,
        updated_at: now,
      });

    if (credentialError) throw new Error(`Unable to save Google credentials: ${credentialError.message}`);

    return { userId: consumedState.user_id, email: googleEmail };
  }

  static async disconnect(userId: string) {
    const { error } = await supabaseAdmin
      .from('google_oauth_credentials')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(`Unable to disconnect Google account: ${error.message}`);
  }
}
