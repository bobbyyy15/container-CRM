import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConvertToSaleSchema,
  CreateManualSaleSchema,
  UpdateSaleSchema,
  UpdateSaleStatusSchema,
  UpsertMasterpaySchema,
  ImportSalesSchema,
  WAVE_RELEASE_NUMBER,
  SALE_STATUSES,
} from './deal.schema';
import { DealService } from '../services/deal.service';

/** A first-transaction manual sale: the smallest valid payload. */
const newAccountSale = (overrides: Record<string, unknown> = {}) => ({
  companyName: 'Acme', phone: '(719) 892-0252', email: 'buyer@acme.test',
  totalUnits: 1, buyingRate: 1, sellingPrice: 2, firstTransaction: true, ...overrides,
});
const ACCOUNT_ID = '5f0d7c8e-1a2b-4c3d-8e9f-001122334455';

test('a release number must be in the client WAVE format', () => {
  for (const good of ['WAVE-10317', 'WAVE-10321', 'WAVE-10330', 'WAVE-999', 'WAVE-1234567890']) {
    assert.ok(WAVE_RELEASE_NUMBER.test(good), good);
  }
  for (const bad of ['SAL-CF0C7B82', 'WAVE-', 'WAVE-ABC', 'WAVE 10317', '10317', 'WAVE-12', 'wave-10317']) {
    assert.ok(!WAVE_RELEASE_NUMBER.test(bad), bad);
  }
});

test('a typed release number is accepted and upper-cased', () => {
  const parsed = CreateManualSaleSchema.parse(newAccountSale({ releaseNumber: 'wave-10317' }));
  assert.equal(parsed.releaseNumber, 'WAVE-10317');
});

test('the old SAL- style number is refused as a release number', () => {
  const result = CreateManualSaleSchema.safeParse(newAccountSale({ releaseNumber: 'SAL-CF0C7B82' }));
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /Release number must look like WAVE-10317/);
});

test('a release number is optional, so the database can allocate the next one', () => {
  assert.equal(CreateManualSaleSchema.parse(newAccountSale()).releaseNumber, undefined);
});

test('invoice number and release number are separate references', () => {
  const parsed = CreateManualSaleSchema.parse(newAccountSale({ releaseNumber: 'WAVE-10317', invoiceNumber: 'INV-2026-881' }));
  assert.equal(parsed.invoiceNumber, 'INV-2026-881');
  assert.equal(parsed.releaseNumber, 'WAVE-10317');
  assert.equal((parsed as Record<string, unknown>).saleNumber, undefined, 'there is no separate Sale Number any more');
});

test('First Transaction is required on a manual sale', () => {
  const result = CreateManualSaleSchema.safeParse({ companyName: 'Acme', totalUnits: 1, buyingRate: 1, sellingPrice: 2 });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /First Transaction is required/);
});

test('a first transaction needs a company, and may carry its own Client ID', () => {
  const noCompany = CreateManualSaleSchema.safeParse(newAccountSale({ companyName: undefined }));
  assert.equal(noCompany.success, false);
  assert.match(noCompany.error!.issues[0].message, /Company is required for a first transaction/);
  assert.equal(CreateManualSaleSchema.parse(newAccountSale({ clientCode: 'CL-119' })).clientCode, 'CL-119');
});

test('a first transaction needs the customer phone and email', () => {
  const noPhone = CreateManualSaleSchema.safeParse(newAccountSale({ phone: undefined }));
  assert.equal(noPhone.success, false);
  assert.match(noPhone.error!.issues[0].message, /Phone is required for a first transaction/);

  const noEmail = CreateManualSaleSchema.safeParse(newAccountSale({ email: undefined }));
  assert.equal(noEmail.success, false);
  assert.match(noEmail.error!.issues[0].message, /Email is required for a first transaction/);

  const badEmail = CreateManualSaleSchema.safeParse(newAccountSale({ email: 'buyer.acme.test' }));
  assert.equal(badEmail.success, false);
  assert.match(badEmail.error!.issues[0].message, /must contain an "@"/);
});

test('a repurchase does not need phone or email again', () => {
  const parsed = CreateManualSaleSchema.safeParse({
    totalUnits: 1, buyingRate: 1, sellingPrice: 2, firstTransaction: false, customerAccountId: ACCOUNT_ID,
  });
  assert.ok(parsed.success, parsed.success ? '' : parsed.error.issues[0].message);
});

test('a first transaction cannot also name an existing account', () => {
  const result = CreateManualSaleSchema.safeParse(newAccountSale({ customerAccountId: ACCOUNT_ID }));
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /cannot also name an existing one/);
});

test('a repeat sale names its account by id or Client ID, and not by company name', () => {
  const byName = CreateManualSaleSchema.safeParse(newAccountSale({ firstTransaction: false }));
  assert.equal(byName.success, false, 'a company name alone cannot place a repeat sale');
  assert.match(byName.error!.issues[0].message, /Choose the existing customer account/);

  assert.ok(CreateManualSaleSchema.safeParse(newAccountSale({ firstTransaction: false, companyName: undefined, customerAccountId: ACCOUNT_ID })).success);
  assert.ok(CreateManualSaleSchema.safeParse(newAccountSale({ firstTransaction: false, companyName: undefined, clientCode: 'CL-119' })).success);
});

test('a manual sale takes rates; totals typed by hand are dropped', () => {
  const parsed = CreateManualSaleSchema.parse(newAccountSale({ buyingRate: 1000, sellingPrice: 1500, buyingCost: 1, revenue: 999_999 }));
  assert.equal(parsed.buyingRate, 1000);
  assert.equal(parsed.sellingPrice, 1500);
  assert.equal((parsed as Record<string, unknown>).revenue, undefined);
  assert.equal((parsed as Record<string, unknown>).buyingCost, undefined);
});

test('converting a quotation takes rates, and First Transaction may come from the inquiry', () => {
  assert.ok(ConvertToSaleSchema.safeParse({ total_units: 2, buying_rate: 3500, selling_price: 5000 }).success);
  const conflicting = ConvertToSaleSchema.safeParse({
    total_units: 2, buying_rate: 3500, selling_price: 5000, first_transaction: true, customer_account_id: ACCOUNT_ID,
  });
  assert.equal(conflicting.success, false);
  assert.equal(ConvertToSaleSchema.safeParse({ total_units: 2, buying_cost: 7000, revenue: 10000 }).success, false, 'totals alone are refused');
});

test('Cancelled is a status a sale may have', () => {
  assert.deepEqual([...SALE_STATUSES], ['Pending', 'Won', 'Cancelled']);
  assert.equal(UpdateSaleStatusSchema.parse({ status: 'Cancelled' }).status, 'Cancelled');
  assert.equal(UpdateSaleSchema.parse({ status: 'Cancelled' }).status, 'Cancelled');
  assert.equal(UpdateSaleSchema.safeParse({ status: 'Refunded' }).success, false);
});

test('an edit may change the invoice and release numbers, and must name at least one field', () => {
  const parsed = UpdateSaleSchema.parse({
    invoiceNumber: 'INV-9', releaseNumber: 'wave-10321', saleDate: '2026-08-14',
    totalUnits: 4, buyingRate: 1000, sellingPrice: 2500, status: 'Won',
  });
  assert.equal(parsed.invoiceNumber, 'INV-9');
  assert.equal(parsed.releaseNumber, 'WAVE-10321');
  assert.equal(UpdateSaleSchema.safeParse({}).success, false, 'an empty edit is refused');
});

test('an edit cannot supply revenue, profit or a payment date directly', () => {
  const parsed = UpdateSaleSchema.parse({ totalUnits: 2, revenue: 999_999, grossProfit: 999_999, paymentDate: '2026-09-01' } as never);
  assert.equal((parsed as Record<string, unknown>).revenue, undefined);
  assert.equal((parsed as Record<string, unknown>).grossProfit, undefined);
  assert.equal((parsed as Record<string, unknown>).paymentDate, undefined, 'Masterpay owns the payment date');
});

test('totals are recalculated from quantity and the two rates', () => {
  assert.deepEqual(DealService.recalculate(5, 1000, 2500), { revenue: 12_500, buying_cost: 5_000, gross_profit: 7_500 });
  assert.deepEqual(DealService.recalculate(1, 0, 0), { revenue: 0, buying_cost: 0, gross_profit: 0 });
  // A sale at a loss stays a loss rather than being clamped.
  assert.deepEqual(DealService.recalculate(2, 900, 400), { revenue: 800, buying_cost: 1_800, gross_profit: -1_000 });
});

test('an import defaults to a preview, so nothing is written unasked', () => {
  const parsed = ImportSalesSchema.parse({ rows: [{ 'Company Name': 'Acme' }] });
  assert.equal(parsed.dryRun, true);
  assert.equal(ImportSalesSchema.parse({ rows: [{ a: 1 }], dryRun: false }).dryRun, false);
  assert.equal(ImportSalesSchema.safeParse({ rows: [] }).success, false, 'an empty file is refused');
});

test('a Masterpay payment needs a date once it is recorded', () => {
  const missing = UpsertMasterpaySchema.safeParse({ paymentStatus: 'Paid' });
  assert.equal(missing.success, false);
  assert.match(missing.error!.issues[0].message, /payment date is required/);
  assert.equal(UpsertMasterpaySchema.parse({ paymentStatus: 'Partially Paid', paymentDate: '2026-09-01', paymentAmount: 500 }).paymentDate, '2026-09-01');
});

test('an unpaid Masterpay record carries no payment date', () => {
  assert.equal(UpsertMasterpaySchema.parse({ paymentStatus: 'Unpaid', paymentDate: '2026-09-01' }).paymentDate, null);
});

test('a Masterpay payment cannot be dated in the future or carry negative money', () => {
  const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(UpsertMasterpaySchema.safeParse({ paymentStatus: 'Paid', paymentDate: nextYear }).success, false);
  assert.equal(UpsertMasterpaySchema.safeParse({ paymentStatus: 'Unpaid', credit: -5 }).success, false);
  assert.equal(UpsertMasterpaySchema.safeParse({ paymentStatus: 'Refunded' }).success, false);
});
