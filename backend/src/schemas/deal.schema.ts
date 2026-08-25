import { z } from 'zod';

export const CreateQuotationSchema = z.object({
  inquiry_id: z.string().uuid(),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  total_amount: z.number().min(0),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0)
  })).min(1)
});

export const UpdateQuotationStatusSchema = z.object({
  status: z.enum(['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Converted'])
});

export const ConvertToSaleSchema = z.object({
  total_units: z.number().int().min(1),
  buying_cost: z.number().min(0),
  revenue: z.number().min(0)
});
