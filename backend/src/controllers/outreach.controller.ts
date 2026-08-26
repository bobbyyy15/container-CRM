import { Request, Response } from 'express';
import { MailService } from '../services/mail.service';
import { z } from 'zod';

const SendEmailSchema = z.object({
  prospectId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1)
});

export class OutreachController {
  
  static async sendEmail(req: Request, res: Response) {
    try {
      const payload = SendEmailSchema.parse(req.body);
      const userId = req.auth!.user.id;

      const result = await MailService.sendColdEmail(
        payload.to, 
        payload.subject, 
        payload.body, 
        userId, 
        payload.prospectId
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

}
