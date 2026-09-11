import { z } from 'zod';

const optString = z.preprocess(
  val => (val === null || val === undefined ? undefined : String(val).trim() || undefined),
  z.string().optional()
);

export const ImportRowSchema = z.object({
  date_added: optString,
  pic: optString,
  category: optString,
  sms_deliverability: optString,
  email_deliverability: optString,
  industry: optString,
  service_locations: optString,
  country: optString,
  state_province: optString,
  city: optString,
  // Company Name, Contact Person, and a contact channel are no longer enforced here: a row
  // missing any of these is still worth preserving in import history (see
  // process_prospect_import_batch) rather than rejecting the whole batch at the API
  // boundary. The database function is the authority on what's importable vs. recorded for
  // review, since it can give each row its own specific reason instead of one generic 400.
  company_name: optString,
  contact_person: optString,
  contact_number_direct: optString,
  contact_number_2: optString,
  email_active: optString,
  email_2: optString,
  address: optString,
});

export const BulkImportPayloadSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(5000),
  batch_id: z.string().uuid().optional(),
  filename: z.string().trim().max(255).optional(),
});

export type ImportRow = z.infer<typeof ImportRowSchema>;
