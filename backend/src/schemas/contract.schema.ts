import { z } from 'zod';

export const CreateContractSchema = z.object({
  sale_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  allocation_quantity: z.number().int().min(1),
  pickup_date: z.string().datetime().optional(),
});

export const UpdateContractSchema = z.object({
  pickup_status: z.enum(['Pending', 'Scheduled', 'Confirmed', 'Picked Up']).optional(),
  pickup_date: z.string().datetime().nullable().optional(),
  status: z.enum(['Pending Signature', 'Active', 'Completed', 'Cancelled']).optional(),
}).refine(value => Object.keys(value).length > 0, 'At least one contract field is required');
