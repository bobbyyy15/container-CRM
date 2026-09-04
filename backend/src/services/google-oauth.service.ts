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
        // Least-privilege Drive scope: lets the app create and write the spreadsheets
        // it exports, with no access to anything else already in the user's Drive.
        // Accounts connected before this was added keep working for Gmail but must
        // reconnect once before Google Sheets export will authorize.
        'https://www.googleapis.com/auth/drive.file',
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

  /**
   * Stores the refresh token Supabase hands back from its own Google sign-in.
   *
   * The token arrives from the browser, so nothing about it can be taken on trust.
   * It is redeemed against our own OAuth client first: Google rejects a refresh
   * token that was issued to a different client, which proves the token is both
   * valid and ours, and the account identity is then read from Google's response
   * rather than from the request body. Previously the caller-supplied email was
   * written straight to the credential row, which let a user store an arbitrary
   * address -- and that address is what MailService uses as the outreach `from`
   * and what System Settings displays as the connected account.
   */
  static async syncProviderToken(userId: string, refreshToken: string) {
    const oauthClient = createOAuthClient();
    oauthClient.setCredentials({ refresh_token: refreshToken });

    let googleEmail: string | null | undefined;
    try {
      // Forces a refresh round-trip; throws if the token is invalid or foreign.
      await oauthClient.getAccessToken();
      const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
      const userInfo = await oauth2.userinfo.get();
      googleEmail = userInfo.data.email;
    } catch (error: any) {
      throw new Error(`Google rejected that refresh token: ${error.message}`);
    }

    if (!googleEmail) throw new Error('Google did not return an email address for that token.');

    const { error } = await supabaseAdmin
      .from('google_oauth_credentials')
      .upsert({
        user_id: userId,
        google_email: googleEmail,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      });

    if (error) throw new Error(`Unable to save Google credentials: ${error.message}`);
  }
}
