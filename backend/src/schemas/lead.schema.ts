import { z } from 'zod';

export const ConvertProspectSchema = z.object({
  prospectId: z.string().uuid(),
  // Additional data can go here
});

export const CreateInquirySchema = z.object({
  warmLeadId: z.string().uuid(),
  requirements: z.string().optional(),
});

export const LeadListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const RemovePipelineEntrySchema = z.object({
  stage: z.enum(['prospect', 'warm_lead', 'inquiry']),
  entityId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
