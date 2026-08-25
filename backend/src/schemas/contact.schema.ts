import { z } from 'zod';

export const CreateContactSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().optional(),
  phone_direct: z.string().optional(),
  phone_2: z.string().optional(),
  email_active: z.string().email("Invalid email").optional().or(z.literal('')),
  email_2: z.string().email("Invalid email").optional().or(z.literal('')),
});

export const UpdateContactSchema = CreateContactSchema.partial();
