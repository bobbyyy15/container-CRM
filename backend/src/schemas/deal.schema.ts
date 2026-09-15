import { z } from 'zod';
import { PAYMENT_STATUSES } from '../services/sale-financials';

/**
 * Their format for a release reference. The column is still sales.sale_number -- renaming
 * it would touch the allocator, its trigger, the uniqueness index and the format check for
 * no change in meaning -- but it is the Release Number everywhere a person sees it.
 */
export const WAVE_RELEASE_NUMBER = /^WAVE-\d{3,10}$/;
const releaseNumber = z.string().trim().toUpperCase().regex(WAVE_RELEASE_NUMBER, 'Release number must look like WAVE-10317');
export const SALE_STATUSES = ['Pending', 'Won', 'Cancelled'] as const;
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/**
 * Which customer account a sale belongs to. First Transaction is required, not inferred:
 * the same company can hold more than one account, so the company name alone cannot say
 * whether a sale opens a new account or adds to an existing one.
 */
const accountFields = {
  firstTransaction: z.boolean({ error: 'First Transaction is required: say whether this sale opens a new customer account' }),
  customerAccountId: z.string().uuid().optional(),
  /** The Client ID. For a first transaction, blank allocates the next one. */
  clientCode: z.string().trim().max(40).optional(),
};

type AccountChoice = { firstTransaction?: boolean; customerAccountId?: string; clientCode?: string };

const checkAccountChoice = (data: AccountChoice, context: z.RefinementCtx) => {
  if (data.firstTransaction === true && data.customerAccountId) {
    context.addIssue({
      code: 'custom',
      path: ['customerAccountId'],
      message: 'A first transaction opens a new customer account, so it cannot also name an existing one',
    });
  }
  if (data.firstTransaction === false && !data.customerAccountId && !data.clientCode) {
    context.addIssue({
      code: 'custom',
      path: ['customerAccountId'],
      message: 'Choose the existing customer account (Client ID) this sale belongs to',
    });
  }
};

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

/**
 * Recording the sale an accepted quotation became. Rates, not totals: the totals are
 * derived on the server. First Transaction may be left out only when the quotation's
 * inquiry is already linked to a customer account, which then answers it.
 */
export const ConvertToSaleSchema = z.object({
  total_units: z.number().int().min(1),
  buying_rate: z.number().min(0),
  selling_price: z.number().min(0),
  first_transaction: z.boolean().optional(),
  customer_account_id: z.string().uuid().optional(),
  client_code: z.string().trim().max(40).optional(),
  sale_date: isoDate.optional(),
}).superRefine((data, context) => {
  if (data.first_transaction === undefined) return;
  checkAccountChoice({
    firstTransaction: data.first_transaction,
    customerAccountId: data.customer_account_id,
    clientCode: data.client_code,
  }, context);
});

export const CreateManualSaleSchema = z.object({
  // Required for a first transaction; an existing account already knows its company.
  companyName: z.string().trim().min(1).optional(),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  picId: z.string().uuid().optional(),
  totalUnits: z.number().int().min(1),
  // Rates only. Total Buy, Total Sell and Profit are derived server-side.
  buyingRate: z.number().min(0),
  sellingPrice: z.number().min(0),
  stateProvince: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  // What was sold, and when it was sold -- a sale entered after the fact is dated by the
  // person entering it, not by the clock.
  containerSizeId: z.string().uuid().optional(),
  containerConditionId: z.string().uuid().optional(),
  containerCategoryId: z.string().uuid().optional(),
  saleDate: isoDate.optional(),
  invoiceNumber: z.string().trim().max(60).optional(),
  // Left out, the database allocates the next WAVE number.
  releaseNumber: releaseNumber.optional(),
  status: z.enum(SALE_STATUSES).optional(),
  ...accountFields,
}).superRefine((data, context) => {
  checkAccountChoice(data, context);
  if (data.firstTransaction && !data.companyName) {
    context.addIssue({ code: 'custom', path: ['companyName'], message: 'Company is required for a first transaction' });
  }
});

/**
 * Editing an existing sale. Every field is optional -- a request changes what it names.
 *
 * Revenue and profit are deliberately absent: they follow from quantity, buying rate and
 * selling price, and are recalculated server-side so a hand-typed total can never reach
 * the dashboards. The payment date is absent too: Masterpay owns it.
 */
export const UpdateSaleSchema = z.object({
  invoiceNumber: z.string().trim().max(60).nullable().optional(),
  releaseNumber: releaseNumber.optional(),
  saleDate: isoDate.nullable().optional(),
  totalUnits: z.number().int().min(1).optional(),
  buyingRate: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  containerSizeId: z.string().uuid().nullable().optional(),
  containerConditionId: z.string().uuid().nullable().optional(),
  containerCategoryId: z.string().uuid().nullable().optional(),
  picId: z.string().uuid().nullable().optional(),
  status: z.enum(SALE_STATUSES).optional(),
}).refine(payload => Object.keys(payload).length > 0, { message: 'Nothing to update' });

/** A parsed spreadsheet on its way in: raw rows, and whether to commit or only report. */
export const ImportSalesSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  dryRun: z.boolean().default(true),
  filename: z.string().trim().max(255).optional(),
});

export const UpdateSaleStatusSchema = z.object({
  status: z.enum(['Pending', 'Won', 'Cancelled']),
});

const moneyOrZero = z.number().min(0);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Masterpay's record of what was paid against one sale. It is the only place a payment
 * date is written; Sales Tracker reads it from here. An unpaid record carries no date.
 */
export const UpsertMasterpaySchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES),
  paymentDate: isoDate.nullable().optional(),
  paymentAmount: moneyOrZero.nullable().optional(),
  vendorInvoiceReference: z.string().trim().max(120).nullable().optional(),
  unitLocation: z.string().trim().max(200).nullable().optional(),
  additionalMarkup: moneyOrZero.optional(),
  credit: moneyOrZero.optional(),
  releaseDate: isoDate.nullable().optional(),
  remarks: z.string().trim().max(2000).nullable().optional(),
}).superRefine((data, context) => {
  if (data.paymentStatus !== 'Unpaid' && !data.paymentDate) {
    context.addIssue({ code: 'custom', path: ['paymentDate'], message: 'A payment date is required once a payment is recorded' });
  }
  if (data.paymentDate && data.paymentDate > today()) {
    context.addIssue({ code: 'custom', path: ['paymentDate'], message: 'A payment date cannot be in the future' });
  }
}).transform(data => (data.paymentStatus === 'Unpaid' ? { ...data, paymentDate: null } : data));

export type CreateQuotationPayload = z.infer<typeof CreateQuotationSchema>;
export type ConvertToSalePayload = z.infer<typeof ConvertToSaleSchema>;
export type UpdateQuotationStatusPayload = z.infer<typeof UpdateQuotationStatusSchema>;
export type CreateManualSalePayload = z.infer<typeof CreateManualSaleSchema>;
export type UpdateSaleStatusPayload = z.infer<typeof UpdateSaleStatusSchema>;
export type UpdateSalePayload = z.infer<typeof UpdateSaleSchema>;
export type ImportSalesPayload = z.infer<typeof ImportSalesSchema>;
export type UpsertMasterpayPayload = z.infer<typeof UpsertMasterpaySchema>;
