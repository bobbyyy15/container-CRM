import { z } from 'zod';

export const ConvertProspectSchema = z.object({
  prospectId: z.string().uuid(),
  // Additional data can go here
});

export const CreateInquirySchema = z.object({
  warmLeadId: z.string().uuid(),
  requirements: z.string().optional(),
});
