import { z } from 'zod';

export const ConvertProspectSchema = z.object({
  prospectId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  channel: z.string().trim().max(100).optional(),
});

export const CreateInquirySchema = z.object({
  warmLeadId: z.string().uuid(),
  containerSizeId: z.string().uuid(),
  containerConditionId: z.string().uuid(),
  quantity: z.number().int().min(1),
  neededByDate: z.string().date().optional(),
  requirements: z.string().trim().max(2000).optional(),
  askingPrice: z.number().min(0).optional(),
  specialRequirements: z.string().trim().max(2000).optional(),
  remarks: z.string().trim().max(2000).optional(),
  followUpDate: z.string().date().optional(),
  stateProvince: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});

export const CreateManualWarmLeadSchema = z.object({
  companyName: z.string().trim().min(1, 'Company is required'),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  stateProvince: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  picId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  previousInquiryIndicator: z.boolean().optional(),
  source: z.string().trim().max(100).optional(),
  followUpDate: z.string().date().optional(),
  followUpNotes: z.string().trim().max(2000).optional(),
}).refine(
  data => Boolean(data.contactPerson) || Boolean(data.phone) || Boolean(data.email),
  { message: 'A contact person, phone, or email is required', path: ['contactPerson'] },
);

export const CreateManualInquirySchema = z.object({
  // Either link to an existing Warm Lead, or (when omitted) create/match the company and
  // contact directly -- an existing customer can get a fresh inquiry without one.
  warmLeadId: z.string().uuid().optional(),
  companyName: z.string().trim().min(1).optional(),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  stateProvince: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  picId: z.string().uuid().optional(),
  containerSizeId: z.string().uuid(),
  containerConditionId: z.string().uuid(),
  quantity: z.number().int().min(1),
  neededByDate: z.string().date().optional(),
  askingPrice: z.number().min(0).optional(),
  requirements: z.string().trim().max(2000).optional(),
  specialRequirements: z.string().trim().max(2000).optional(),
  remarks: z.string().trim().max(2000).optional(),
  followUpDate: z.string().date().optional(),
}).refine(
  data => Boolean(data.warmLeadId) || Boolean(data.companyName),
  { message: 'Either warmLeadId or companyName is required', path: ['companyName'] },
);

export const CreateManualProspectSchema = z.object({
  companyName: z.string().trim().min(1, 'Company is required'),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  picId: z.string().uuid().optional(),
  category: z.enum(['Proceed', 'Removed']).default('Proceed'),
  smsDeliverability: z.enum(['Call/Text', 'Calls Only', 'Text Only']).optional(),
  // Frontend offers a fixed list plus "Others" with a free-text specify field; either way
  // this arrives as plain text and is not required.
  industry: z.string().trim().max(100).optional(),
  serviceLocation: z.string().trim().max(200).optional(),
  country: z.string().trim().max(100).optional(),
  stateProvince: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  dateAdded: z.string().date().optional(),
});

export const LeadListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'converted', 'removed', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const RemovePipelineEntrySchema = z.object({
  stage: z.enum(['prospect', 'warm_lead', 'inquiry', 'quotation']),
  entityId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  blockCompany: z.boolean().optional().default(false),
});

export const AssignPicToEntrySchema = z.object({
  stage: z.enum(['prospect', 'warm_lead']),
  entityId: z.string().uuid(),
  picId: z.string().uuid(),
});

export const AddInquiryToWarmLeadsSchema = z.object({
  inquiryId: z.string().uuid(),
});

export const BulkRemovedEntriesSchema = z.object({
  text: z.string().trim().min(1).max(50000),
  reason: z.string().trim().max(500).optional(),
});

export const ValidateInquiryTicketSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().trim().min(3).max(1000).optional(),
  altContainerSizeId: z.string().uuid().optional(),
  altContainerConditionId: z.string().uuid().optional(),
  altQuantity: z.coerce.number().int().min(1).optional(),
  altAskingPrice: z.coerce.number().min(0).optional(),
  altNotes: z.string().trim().max(1000).optional(),
}).refine(data => data.approved || !!data.rejectionReason, {
  message: 'A reason is required to reject an inquiry ticket',
  path: ['rejectionReason'],
});

export const UpdateLeadCellSchema = z.object({
  stage: z.enum(['prospect', 'warm_lead']),
  entityId: z.string().uuid(),
  field: z.enum([
    'company',
    'contact',
    'phone',
    'phone2',
    'emailAddr',
    'email2',
    'country',
    'state',
    'city',
    'address',
    'industry',
    'territory',
    'cat',
    'sms',
    'email',
    'pic',
    'notes',
  ]),
  value: z.string().nullable().optional(),
});

export type CreateInquiryPayload = z.infer<typeof CreateInquirySchema>;
export type CreateManualWarmLeadPayload = z.infer<typeof CreateManualWarmLeadSchema>;
export type CreateManualInquiryPayload = z.infer<typeof CreateManualInquirySchema>;
export type CreateManualProspectPayload = z.infer<typeof CreateManualProspectSchema>;
export type AssignPicToEntryPayload = z.infer<typeof AssignPicToEntrySchema>;
export type BulkRemovedEntriesPayload = z.infer<typeof BulkRemovedEntriesSchema>;
export type ValidateInquiryTicketPayload = z.infer<typeof ValidateInquiryTicketSchema>;
export type UpdateLeadCellPayload = z.infer<typeof UpdateLeadCellSchema>;
