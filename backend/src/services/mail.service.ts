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
