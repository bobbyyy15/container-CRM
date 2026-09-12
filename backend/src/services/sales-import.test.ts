import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSaleRow,
  mapSalesSheet,
  readDate,
  readNumber,
  readStatus,
  readType,
  mapHeaders,
  WAVE_PATTERN,
} from './sales-import';

/** A row in the client's own column names, so the test breaks if the mapping drifts. */
const sheetRow = (overrides: Record<string, unknown> = {}) => ({
  'Date': '2026-08-14',
  'Invoice Number': 'INV-2026-881',
  'Company Name': 'K & T Bowman Trucking Inc',
  'Contact Person': 'Kevin Bowman',
  'Contact Number': '(719) 892-0252',
  'Email Address': 'kevin@bowman.test',
  'State': 'CO',
  'City': 'Eads',
  'Quantity': '3',
  'Type': 'DC',
  'Condition': 'Cargo Worthy',
  'Size': '20ft',
  'Selling Price': '2,100',
  'Buying Rate': '1200',
  'Total Revenue': '6300',
  'Profit': '2700',
  'Remarks / Status': 'Paid',
  'Client ID': 'CL-119',
  ...overrides,
});

test('maps the client spreadsheet columns onto sale fields', () => {
  const row = mapSaleRow(sheetRow(), 2);
  assert.equal(row.errors.length, 0, row.errors.join('; '));
  assert.equal(row.companyName, 'K & T Bowman Trucking Inc');
  assert.equal(row.contactPerson, 'Kevin Bowman');
  assert.equal(row.phone, '(719) 892-0252');
  assert.equal(row.email, 'kevin@bowman.test');
  assert.equal(row.state, 'CO');
  assert.equal(row.city, 'Eads');
  assert.equal(row.invoiceNumber, 'INV-2026-881');
  assert.equal(row.saleDate, '2026-08-14');
  assert.equal(row.quantity, 3);
  assert.equal(row.type, 'DC');
  assert.equal(row.condition, 'Cargo Worthy');
  assert.equal(row.size, '20ft');
  assert.equal(row.clientId, 'CL-119');
});

test('revenue and profit are recalculated, never taken from the sheet', () => {
  const row = mapSaleRow(sheetRow({ 'Total Revenue': '999', 'Profit': '111' }), 2);
  assert.equal(row.revenue, 6300, 'quantity x selling price');
  assert.equal(row.buyingCost, 3600, 'quantity x buying rate');
  assert.equal(row.grossProfit, 2700);
  assert.equal(row.errors.length, 0, 'a disagreeing total is not a reason to refuse the row');
  assert.equal(row.notices.length, 2, 'but it is worth saying');
  assert.match(row.notices[0], /Total Revenue in the sheet is 999/);
});

test('a row missing what a sale needs is refused, with a reason each', () => {
  const row = mapSaleRow(sheetRow({ 'Company Name': '', 'Quantity': '0', 'Selling Price': '', 'Buying Rate': '' }), 7);
  assert.equal(row.rowNumber, 7);
  assert.deepEqual(row.errors, [
    'Company Name is required',
    'Quantity must be a whole number of at least 1',
    'Selling Price is required',
    'Buying Rate is required',
  ]);
});

test('sale numbers must be in WAVE format and are upper-cased', () => {
  assert.ok(WAVE_PATTERN.test('WAVE-10317'));
  assert.ok(!WAVE_PATTERN.test('SAL-CF0C7B82'));
  assert.ok(!WAVE_PATTERN.test('WAVE-'));
  assert.ok(!WAVE_PATTERN.test('WAVE-ABC'));

  const good = mapSaleRow(sheetRow({ 'Sale Number': 'wave-10317' }), 2);
  assert.equal(good.saleNumber, 'WAVE-10317');
  assert.equal(good.errors.length, 0);

  const bad = mapSaleRow(sheetRow({ 'Sale Number': 'SAL-CF0C7B82' }), 2);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /not in WAVE format/);
});

test('a blank sale number is left for the server to allocate', () => {
  const row = mapSaleRow(sheetRow(), 2);
  assert.equal(row.saleNumber, undefined);
  assert.equal(row.errors.length, 0);
});

test('the type column accepts the shorthand the client writes', () => {
  assert.equal(readType('DC'), 'DC');
  assert.equal(readType('dry'), 'DC');
  assert.equal(readType('DD'), 'DD');
  assert.equal(readType('Double Door'), 'DD');
  assert.equal(readType('OS'), 'OS');
  assert.equal(readType('Open Side'), 'OS');
  assert.equal(readType('Flat Rack'), 'FR');
  assert.equal(readType('Reefer'), 'RF');
  assert.equal(readType('Refrigerated'), 'RF');
  assert.equal(readType('spaceship'), undefined);
});

test('an unknown type leaves the field unset rather than refusing the sale', () => {
  const row = mapSaleRow(sheetRow({ 'Type': 'spaceship' }), 2);
  assert.equal(row.type, undefined);
  assert.equal(row.errors.length, 0);
  assert.match(row.notices[0], /not a known container type/);
});

test('remarks decide the status, and cancelled wording is recognised', () => {
  assert.equal(readStatus('Cancelled').status, 'Cancelled');
  assert.equal(readStatus('CANCELED - customer backed out').status, 'Cancelled');
  assert.equal(readStatus('refunded').status, 'Cancelled');
  assert.equal(readStatus('Pending payment').status, 'Pending');
  assert.equal(readStatus('Paid').status, 'Won');
  assert.equal(readStatus('').status, 'Won');
  assert.equal(readStatus('picked up by customer').status, 'Won', 'an unfamiliar note is still a sale');
  assert.equal(readStatus('Cancelled').remark, 'Cancelled', 'the wording is kept as the remark');
});

test('a cancelled row still carries its money, for the record', () => {
  const row = mapSaleRow(sheetRow({ 'Remarks / Status': 'Cancelled' }), 2);
  assert.equal(row.status, 'Cancelled');
  assert.equal(row.revenue, 6300, 'the sale is recorded as it was; the dashboards exclude it by status');
  assert.equal(row.errors.length, 0);
});

test('dates are read from every shape a spreadsheet produces', () => {
  assert.equal(readDate('2026-08-14'), '2026-08-14');
  assert.equal(readDate('8/14/2026'), '2026-08-14');
  assert.equal(readDate('08/14/26'), '2026-08-14');
  assert.equal(readDate('46248'), '2026-08-14', 'Excel day serial');
  assert.equal(readDate(''), undefined);
});

test('money is read past currency symbols, commas and bracketed negatives', () => {
  assert.equal(readNumber('$1,200.50'), 1200.5);
  assert.equal(readNumber(' 900 '), 900);
  assert.equal(readNumber('(250)'), -250);
  assert.equal(readNumber(''), undefined);
  assert.equal(readNumber('n/a'), undefined);
});

test('a future date is refused', () => {
  const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  const row = mapSaleRow(sheetRow({ 'Date': nextYear }), 2);
  assert.ok(row.errors.some(e => /future/.test(e)), row.errors.join('; '));
});

test('a sale number repeated inside one file is refused after its first use', () => {
  // Distinct invoice numbers, so only the repeated sale number is under test.
  const rows = mapSalesSheet([
    sheetRow({ 'Sale Number': 'WAVE-10317', 'Invoice Number': 'INV-1' }),
    sheetRow({ 'Sale Number': 'WAVE-10317', 'Invoice Number': 'INV-2' }),
    sheetRow({ 'Sale Number': 'WAVE-10318', 'Invoice Number': 'INV-3' }),
  ]);
  assert.equal(rows[0].errors.length, 0);
  assert.match(rows[1].errors[0], /Sale Number WAVE-10317 already appears on row 2/);
  assert.equal(rows[2].errors.length, 0);
});

test('a repeated invoice number is refused the same way', () => {
  const rows = mapSalesSheet([
    sheetRow({ 'Invoice Number': 'INV-1' }),
    sheetRow({ 'Invoice Number': 'INV-1' }),
  ]);
  assert.equal(rows[0].errors.length, 0);
  assert.match(rows[1].errors[0], /Invoice Number INV-1 already appears on row 2/);
});

test('rows are numbered as lines of the sheet, counting the header', () => {
  const rows = mapSalesSheet([sheetRow(), sheetRow()]);
  assert.deepEqual(rows.map(r => r.rowNumber), [2, 3]);
});

test('headers are recognised however they are punctuated', () => {
  const mapped = mapHeaders(['Date', 'Invoice Number', 'invoice_no', 'COMPANY NAME', 'Qty', 'Selling Price', 'Margin', 'Nonsense']);
  assert.deepEqual(mapped, ['saleDate', 'invoiceNumber', 'invoiceNumber', 'companyName', 'quantity', 'sellingPrice', 'ignore', undefined]);
});
