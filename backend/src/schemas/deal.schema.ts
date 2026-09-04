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

export const CreateManualSaleSchema = z.object({
  companyName: z.string().trim().min(1, 'Company is required'),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  picId: z.string().uuid().optional(),
  totalUnits: z.number().int().min(1),
  buyingCost: z.number().min(0),
  revenue: z.number().min(0),
  stateProvince: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});

export const UpdateSaleStatusSchema = z.object({
  status: z.string().trim().min(1, 'Status is required'),
});

export type CreateQuotationPayload = z.infer<typeof CreateQuotationSchema>;
export type ConvertToSalePayload = z.infer<typeof ConvertToSaleSchema>;
export type UpdateQuotationStatusPayload = z.infer<typeof UpdateQuotationStatusSchema>;
export type CreateManualSalePayload = z.infer<typeof CreateManualSaleSchema>;
export type UpdateSaleStatusPayload = z.infer<typeof UpdateSaleStatusSchema>;
