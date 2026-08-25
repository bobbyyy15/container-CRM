import { Request, Response } from 'express';
import { LeadService } from '../services/lead.service';
import { ConvertProspectSchema, CreateInquirySchema } from '../schemas/lead.schema';

export class LeadController {
  static async convertProspect(req: Request, res: Response) {
    try {
      const prospectId = req.params.prospectId as string;
      
      // Validate with Zod
      ConvertProspectSchema.parse({ prospectId });

      // In a real app, actorId comes from req.user (JWT context)
      // Hardcoding for now since Auth isn't fully wired
      const actorId = '00000000-0000-0000-0000-000000000000'; 

      const warmLead = await LeadService.convertProspectToWarmLead(prospectId, actorId);
      
      res.json({
        success: true,
        data: warmLead,
        meta: {}
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { message: error.message }
      });
    }
  }

  static async createInquiry(req: Request, res: Response) {
    try {
      const warmLeadId = req.params.warmLeadId as string;
      const { requirements } = req.body;

      CreateInquirySchema.parse({ warmLeadId, requirements });

      const actorId = '00000000-0000-0000-0000-000000000000';

      const inquiry = await LeadService.createInquiry(warmLeadId, actorId, requirements);

      res.json({
        success: true,
        data: inquiry
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { message: error.message }
      });
    }
  }
}
