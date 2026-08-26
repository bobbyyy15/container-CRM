import { z } from 'zod';

export const ImportRowSchema = z.object({
  date_added: z.string().optional(),
  pic: z.string().optional(),
  category: z.string().optional(),
  sms_deliverability: z.string().optional(),
  email_deliverability: z.string().optional(),
  industry: z.string().optional(),
  service_locations: z.string().optional(),
  country: z.string().optional(),
  state_province: z.string().optional(),
  city: z.string().optional(),
  company_name: z.string().trim().min(1, "Company Name is required"),
  contact_person: z.string().trim().min(1, "Contact Person is required"),
  contact_number_direct: z.string().optional(),
  contact_number_2: z.string().optional(),
  email_active: z.string().optional(),
  email_2: z.string().optional(),
  address: z.string().optional(),
}).refine(
  row => [row.email_active, row.email_2, row.contact_number_direct, row.contact_number_2]
    .some(value => Boolean(value?.trim())),
  { message: 'At least one email address or phone number is required' },
);

export const BulkImportPayloadSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(5000),
  batch_id: z.string().uuid().optional(),
  filename: z.string().trim().max(255).optional(),
});

export type ImportRow = z.infer<typeof ImportRowSchema>;
