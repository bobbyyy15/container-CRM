import nodemailer from 'nodemailer';
import { getGoogleOAuthConfig } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class MailService {
  static async sendColdEmail(to: string, subject: string, html: string, actorId: string, prospectId: string) {
    const googleConfig = getGoogleOAuthConfig();

    const { data: credential, error: credentialError } = await supabaseAdmin
      .from('google_oauth_credentials')
      .select('refresh_token, google_email')
      .eq('user_id', actorId)
      .maybeSingle();

    if (credentialError || !credential) {
      throw new Error('Connect a Google account in System Settings before sending outreach.');
    }

    // This is the minimum safe gate supported by the current schema. The full removed/deliverability
    // eligibility service must be implemented before bulk outreach is enabled.
    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('prospect_clients')
      .select('id, category, contacts(email_active, email_2)')
      .eq('id', prospectId)
      .maybeSingle();

    if (prospectError || !prospect) throw new Error('Prospect not found.');
    if (prospect.category !== 'Proceed') throw new Error('Outreach is blocked because this prospect is not eligible to proceed.');

    const contact = prospect.contacts as unknown as { email_active?: string | null; email_2?: string | null } | null;
    const allowedEmails = [contact?.email_active, contact?.email_2]
      .filter((email): email is string => Boolean(email))
      .map(normalizeEmail);

    if (!allowedEmails.includes(normalizeEmail(to))) {
      throw new Error('The recipient does not match an email address on this prospect.');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: credential.google_email,
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        refreshToken: credential.refresh_token,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: credential.google_email,
        to,
        subject,
        html,
      });

      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_sent',
        actor_id: actorId,
        payload: { messageId: info.messageId, to, subject, sender: credential.google_email },
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_failed',
        actor_id: actorId,
        payload: { to, subject, error: error.message },
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
