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
  // Company Name, Contact Person, and a contact channel are no longer enforced here: a row
  // missing any of these is still worth preserving in import history (see
  // process_prospect_import_batch) rather than rejecting the whole batch at the API
  // boundary. The database function is the authority on what's importable vs. recorded for
  // review, since it can give each row its own specific reason instead of one generic 400.
  company_name: z.string().trim().optional(),
  contact_person: z.string().trim().min(1).optional(),
  contact_number_direct: z.string().optional(),
  contact_number_2: z.string().optional(),
  email_active: z.string().optional(),
  email_2: z.string().optional(),
  address: z.string().optional(),
});

export const BulkImportPayloadSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(5000),
  batch_id: z.string().uuid().optional(),
  filename: z.string().trim().max(255).optional(),
});

export type ImportRow = z.infer<typeof ImportRowSchema>;
