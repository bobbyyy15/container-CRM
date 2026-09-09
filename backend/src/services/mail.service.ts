import { google } from 'googleapis';
import { getGoogleOAuthConfig } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { buildGmailRawMessage } from './gmail-message';

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

    const { data: prospect, error: prospectError } = await supabaseAdmin
      .from('prospect_clients')
      .select('id, company_id, contact_id, pic_id, category, lifecycle_status, contacts(email_active, email_2, phone_direct, phone_2)')
      .eq('id', prospectId)
      .maybeSingle();

    if (prospectError || !prospect) throw new Error('Prospect not found.');
    const { data: actorPic } = await supabaseAdmin.from('pics').select('id').eq('profile_id', actorId).eq('status', 'active').maybeSingle();
    if (!actorPic || actorPic.id !== prospect.pic_id) throw new Error('You may only contact prospects assigned to your PIC identity.');
    if (prospect.lifecycle_status !== 'active') throw new Error('Outreach is blocked because this prospect is no longer active.');
    if (prospect.category !== 'Proceed') throw new Error('Outreach is blocked because this prospect is not eligible to proceed.');

    const contact = prospect.contacts as unknown as { email_active?: string | null; email_2?: string | null; phone_direct?: string | null; phone_2?: string | null } | null;
    const allowedEmails = [contact?.email_active, contact?.email_2]
      .filter((email): email is string => Boolean(email))
      .map(normalizeEmail);

    if (!allowedEmails.includes(normalizeEmail(to))) {
      throw new Error('The recipient does not match an email address on this prospect.');
    }

    const { data: isRemoved, error: suppressionError } = await supabaseAdmin.rpc('is_pipeline_identity_removed', {
      p_company_id: prospect.company_id,
      p_contact_id: prospect.contact_id,
      p_email_1: contact?.email_active ?? null,
      p_email_2: contact?.email_2 ?? null,
      p_phone_1: contact?.phone_direct ?? null,
      p_phone_2: contact?.phone_2 ?? null,
    });
    if (suppressionError) throw new Error(`Could not verify outreach suppression: ${suppressionError.message}`);
    if (isRemoved) throw new Error('Outreach is blocked because this identity is on the removed/suppression list.');

    const oauthClient = new google.auth.OAuth2(
      googleConfig.clientId,
      googleConfig.clientSecret,
      googleConfig.redirectUri,
    );
    oauthClient.setCredentials({ refresh_token: credential.refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauthClient });

    try {
      // The OAuth flow grants gmail.send, which authorizes Gmail API delivery. It
      // does not grant SMTP's broader https://mail.google.com/ scope.
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: buildGmailRawMessage(credential.google_email, to, subject, html),
        },
      });
      const messageId = response.data.id;
      if (!messageId) throw new Error('Google accepted the request but returned no message ID.');

      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_sent',
        actor_id: actorId,
        payload: { messageId, to, subject, sender: credential.google_email },
      });

      // Count it against today's outreach. The mail is already gone, so a failure
      // here must not surface as a send failure and make the caller retry -- that
      // would send a second real email. Logged and swallowed instead; the figure
      // is reconcilable from the email_sent domain events above.
      const { error: activityError } = await supabaseAdmin.rpc('log_auto_email', {
        p_pic_id: actorPic.id,
        p_actor_id: actorId,
      });
      if (activityError) {
        console.error('Email sent but not counted in daily_activity:', activityError.message);
      }

      return { success: true, messageId };
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
