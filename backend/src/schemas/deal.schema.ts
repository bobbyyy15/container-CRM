import { z } from 'zod';

export const CreateQuotationSchema = z.object({
  inquiry_id: z.string().uuid(),
  valid_until: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0)
  })).min(1)
});

export const UpdateQuotationStatusSchema = z.object({
  status: z.enum(['Sent', 'Viewed', 'Accepted', 'Rejected'])
});

export const ConvertToSaleSchema = z.object({
  total_units: z.number().int().min(1),
  buying_cost: z.number().min(0),
  revenue: z.number().min(0)
});

export type CreateQuotationPayload = z.infer<typeof CreateQuotationSchema>;
export type ConvertToSalePayload = z.infer<typeof ConvertToSaleSchema>;
export type UpdateQuotationStatusPayload = z.infer<typeof UpdateQuotationStatusSchema>;
