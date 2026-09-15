import assert from 'node:assert/strict';
import test from 'node:test';
import { masterpayColumns, toMasterpayRow, withPayment } from './masterpay-rows';
import { UpsertMasterpaySchema } from '../schemas/deal.schema';

const sale = (overrides: Record<string, unknown> = {}) => ({
  id: 'sale-1',
  sale_number: 'WAVE-10424',
  invoice_number: 'INV-881',
  sale_date: '2026-09-15',
  created_at: '2026-09-15T08:00:00Z',
  status: 'Won',
  total_units: 3,
  buying_cost: 6000,
  revenue: 8400,
  gross_profit: 2400,
  pics: { name: 'Jane Doe' },
  customer_accounts: { id: 'account-1', client_code: 'CID-00012', first_transaction_date: '2026-06-01' },
  companies: {
    id: 'company-1', name: 'Acme Logistics', address_street: '1 Dock Rd', address_city: 'Houston', address_state: 'TX', address_country: 'US',
    company_contacts: [{ is_primary: true, contacts: { first_name: 'Kevin', last_name: 'Bowman', email_active: 'kevin@acme.test', phone_direct: '(719) 892-0252' } }],
  },
  container_sizes: { name: '40ft HC' },
  container_conditions: { name: 'Cargo Worthy' },
  container_categories: { code: 'DC', name: 'Dry' },
  quotations: null,
  masterpay_records: null,
  ...overrides,
});

test('a Masterpay row reads the sale, its account and its company rather than copies of them', () => {
  const row = toMasterpayRow(sale());
  assert.equal(row.saleId, 'sale-1');
  assert.equal(row.invoiceNumber, 'INV-881');
  assert.equal(row.releaseNumber, 'WAVE-10424');
  assert.equal(row.customerId, 'CID-00012');
  assert.equal(row.customerAccountId, 'account-1');
  assert.equal(row.companyName, 'Acme Logistics');
  assert.equal(row.contactPerson, 'Kevin Bowman');
  assert.equal(row.businessAddress, '1 Dock Rd, Houston, TX, US');
  assert.equal(row.size, '40ft HC');
  assert.equal(row.condition, 'Cargo Worthy');
  assert.equal(row.category, 'DC');
  assert.equal(row.buyingPrice, 2000);
  assert.equal(row.sellingPrice, 2800);
  assert.equal(row.totalSell, 8400);
  assert.equal(row.profit, 2400);
});

test('a sale without a Masterpay record is unpaid, with no payment date', () => {
  const row = toMasterpayRow(sale());
  assert.equal(row.hasRecord, false);
  assert.equal(row.paymentStatus, 'Unpaid');
  assert.equal(row.paymentDate, null);
  assert.equal(row.totalProfit, 2400);
});

test('a Masterpay record supplies the payment date and adjusts total profit', () => {
  const row = toMasterpayRow(sale({
    masterpay_records: {
      payment_status: 'Paid', payment_date: '2026-09-20', payment_amount: '8400', additional_markup: '200', credit: '50',
      vendor_invoice_reference: 'VND-77', unit_location: 'Houston depot', release_date: '2026-09-21', remarks: 'Wire received',
    },
  }));
  assert.equal(row.hasRecord, true);
  assert.equal(row.paymentStatus, 'Paid');
  assert.equal(row.paymentDate, '2026-09-20');
  assert.equal(row.paymentAmount, 8400);
  assert.equal(row.totalProfit, 2550);
  assert.equal(row.vendorInvoiceReference, 'VND-77');
  assert.equal(row.releaseDate, '2026-09-21');
});

test('two accounts under the same company name stay separate Masterpay rows', () => {
  const first = toMasterpayRow(sale({ id: 'sale-a', customer_accounts: { id: 'account-a', client_code: 'CID-00001' } }));
  const second = toMasterpayRow(sale({ id: 'sale-b', customer_accounts: { id: 'account-b', client_code: 'CID-00002' } }));
  assert.equal(first.companyName, second.companyName);
  assert.notEqual(first.customerAccountId, second.customerAccountId);
  assert.notEqual(first.customerId, second.customerId);
});

test('a cancelled sale stays on Masterpay as a record', () => {
  assert.equal(toMasterpayRow(sale({ status: 'Cancelled' })).saleStatus, 'Cancelled');
});

test('a quotation sale reads size and condition from its inquiry when it has none of its own', () => {
  const row = toMasterpayRow(sale({
    container_sizes: null, container_conditions: null,
    quotations: { contacts: { first_name: 'Quote', last_name: 'Contact' }, inquiries: { container_sizes: { name: '20ft' }, container_conditions: { name: 'One Trip' } } },
  }));
  assert.equal(row.size, '20ft');
  assert.equal(row.condition, 'One Trip');
  assert.equal(row.contactPerson, 'Quote Contact');
});

test('saving an unpaid record writes no payment date', () => {
  const columns = masterpayColumns(UpsertMasterpaySchema.parse({ paymentStatus: 'Unpaid', paymentDate: '2026-09-01', credit: 10 }));
  assert.equal(columns.payment_status, 'Unpaid');
  assert.equal(columns.payment_date, null);
  assert.equal(columns.credit, 10);
  assert.equal(columns.additional_markup, 0);
});

test('Sales Tracker rows carry the Masterpay payment date as their own column', () => {
  const paid = withPayment({ id: 'sale-1', masterpay_records: [{ payment_status: 'Paid', payment_date: '2026-09-20' }] });
  assert.equal(paid.payment_date, '2026-09-20');
  assert.equal(paid.payment_status, 'Paid');
  assert.equal('masterpay_records' in paid, false);

  const unpaid = withPayment({ id: 'sale-2', masterpay_records: null });
  assert.equal(unpaid.payment_date, null);
  assert.equal(unpaid.payment_status, 'Unpaid');
});
