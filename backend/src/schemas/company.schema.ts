import { z } from 'zod';

export const CreateCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  address_street: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().optional(),
  address_country: z.string().optional(),
  address_postal_code: z.string().optional(),
});

export const UpdateCompanySchema = CreateCompanySchema.partial();
