import { z } from 'zod';

export const UpdateUserSchema = z.object({
  role: z.enum(['admin', 'manager', 'pic']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: 'At least one of role or status is required',
});

export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
