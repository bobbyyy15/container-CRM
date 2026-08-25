import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase';

// In a robust multi-tenant CRM, we would store SMTP credentials per user in the database.
// For MVP, we configure a master transporter using env vars, or allow passing credentials.
export class MailService {
  
  static createTransporter(userEmail?: string, appPassword?: string) {
    // If user provides specific credentials (from DB), use them. Otherwise fallback to global env vars
    const user = userEmail || process.env.SMTP_USER;
    const pass = appPassword || process.env.SMTP_PASS;

    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user,
        pass
      }
    });
  }

  static async sendColdEmail(to: string, subject: string, html: string, actorId: string, prospectId: string) {
    const transporter = this.createTransporter();

    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_USER, // Sender address
        to,
        subject,
        html
      });

      // Log the event in domain_events
      await supabaseAdmin.from('domain_events').insert({
        entity_type: 'prospect',
        entity_id: prospectId,
        event_type: 'email_sent',
        actor_id: actorId,
        payload: { messageId: info.messageId, to, subject }
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      // Log the failure
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
