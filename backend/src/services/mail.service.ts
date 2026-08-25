import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';

export class MailService {
  
  static async sendColdEmail(to: string, subject: string, html: string, actorId: string, prospectId: string) {
    // 1. Fetch the user's Google OAuth refresh token
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('google_refresh_token, google_email')
      .eq('id', actorId)
      .single();

    if (profileErr || !profile || !profile.google_refresh_token) {
      throw new Error("User has not connected their Google account for outreach.");
    }

    // 2. Configure Nodemailer with OAuth2
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: profile.google_email,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        refreshToken: profile.google_refresh_token
      }
    });

    try {
      // 3. Send Email
      const info = await transporter.sendMail({
        from: profile.google_email,
        to,
        subject,
        html
      });

      // 4. Log event
      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_sent',
        actor_id: actorId,
        payload: { messageId: info.messageId, to, subject, sender: profile.google_email }
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_failed',
        actor_id: actorId,
        payload: { to, subject, error: error.message }
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
