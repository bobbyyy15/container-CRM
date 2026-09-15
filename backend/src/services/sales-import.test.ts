import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSaleRow,
  mapSalesSheet,
  readDate,
  readNumber,
  readStatus,
  readType,
  readYesNo,
  mapHeaders,
  resolveCustomerAccounts,
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

test('the Masterpay sheet headers map onto the same fields', () => {
  const row = mapSaleRow({
    'Date Purchase': '2026-08-14', 'Customer ID': 'CL-7', 'Invoice #': 'INV-7', 'Release Ref.': 'wave-10500',
    'Company Name': 'Acme', 'Qty': '2', 'Size': "40' HC", 'Condition': 'WWT',
    'Buying Price': '1000', 'Selling Price': '1500', 'Total (SR)': '3000',
  }, 2);
  assert.equal(row.errors.length, 0, row.errors.join('; '));
  assert.equal(row.saleDate, '2026-08-14');
  assert.equal(row.clientId, 'CL-7');
  assert.equal(row.invoiceNumber, 'INV-7');
  assert.equal(row.releaseNumber, 'WAVE-10500');
  assert.equal(row.revenue, 3000);
  assert.equal(row.size, "40' HC", 'the raw size is kept for the catalog match');
  assert.equal(row.condition, 'WWT');
});

test('buy, sell, profit and margin are recalculated, never taken from the sheet', () => {
  const row = mapSaleRow(sheetRow({ 'Total Revenue': '999', 'Profit': '111' }), 2);
  assert.equal(row.buyingRate, 1200);
  assert.equal(row.sellingPrice, 2100);
  assert.equal(row.revenue, 6300, 'quantity x selling price');
  assert.equal(row.buyingCost, 3600, 'quantity x buying rate');
  assert.equal(row.grossProfit, 2700);
  assert.equal(row.margin, 42.86);
  assert.equal(row.errors.length, 0, 'a disagreeing total is not a reason to refuse the row');
  assert.equal(row.notices.length, 2, 'but it is worth saying');
  assert.match(row.notices[0], /Total Revenue in the sheet is 999/);
});

test('a row sold for nothing has a zero margin rather than a division error', () => {
  const row = mapSaleRow(sheetRow({ 'Selling Price': '0', 'Total Revenue': '', 'Profit': '' }), 2);
  assert.equal(row.revenue, 0);
  assert.equal(row.margin, 0);
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

test('release numbers must be in WAVE format and are upper-cased', () => {
  assert.ok(WAVE_PATTERN.test('WAVE-10317'));
  assert.ok(!WAVE_PATTERN.test('SAL-CF0C7B82'));
  assert.ok(!WAVE_PATTERN.test('WAVE-'));
  assert.ok(!WAVE_PATTERN.test('WAVE-ABC'));

  const good = mapSaleRow(sheetRow({ 'Release Number': 'wave-10317' }), 2);
  assert.equal(good.releaseNumber, 'WAVE-10317');
  assert.equal(good.errors.length, 0);

  const bad = mapSaleRow(sheetRow({ 'Release Number': 'SAL-CF0C7B82' }), 2);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /Release Number "SAL-CF0C7B82" is not in WAVE format/);
});

test('an older sheet labelled Sale Number still fills the Release Number', () => {
  const row = mapSaleRow(sheetRow({ 'Sale Number': 'WAVE-10318' }), 2);
  assert.equal(row.releaseNumber, 'WAVE-10318');
  assert.equal(row.invoiceNumber, 'INV-2026-881', 'the invoice number stays its own field');
});

test('a blank release number is left for the server to allocate', () => {
  const row = mapSaleRow(sheetRow(), 2);
  assert.equal(row.releaseNumber, undefined);
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

test('a release number repeated inside one file is refused after its first use', () => {
  // Distinct invoice numbers, so only the repeated release number is under test.
  const rows = mapSalesSheet([
    sheetRow({ 'Release Number': 'WAVE-10317', 'Invoice Number': 'INV-1' }),
    sheetRow({ 'Release Number': 'WAVE-10317', 'Invoice Number': 'INV-2' }),
    sheetRow({ 'Release Number': 'WAVE-10318', 'Invoice Number': 'INV-3' }),
  ]);
  assert.equal(rows[0].errors.length, 0);
  assert.match(rows[1].errors[0], /Release Number WAVE-10317 already appears on row 2/);
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
  const mapped = mapHeaders(['Date', 'Invoice Number', 'invoice_no', 'COMPANY NAME', 'Qty', 'Selling Price', 'Margin', 'Nonsense', 'Release Ref.', 'Customer ID', 'First Transaction']);
  assert.deepEqual(mapped, ['saleDate', 'invoiceNumber', 'invoiceNumber', 'companyName', 'quantity', 'sellingPrice', 'ignore', undefined, 'releaseNumber', 'clientId', 'firstTransaction']);
});

test('First Transaction is read as yes or no, and anything else is refused', () => {
  assert.equal(readYesNo('Yes'), true);
  assert.equal(readYesNo('Y'), true);
  assert.equal(readYesNo('new customer'), true);
  assert.equal(readYesNo('No'), false);
  assert.equal(readYesNo('repeat'), false);
  assert.equal(readYesNo('maybe'), undefined);
  const row = mapSaleRow(sheetRow({ 'First Transaction': 'maybe' }), 2);
  assert.match(row.errors[0], /First Transaction "maybe" must be Yes or No/);
});

// ── Customer accounts ────────────────────────────────────────────────────────────────

const accountRows = (...overrides: Record<string, unknown>[]) =>
  mapSalesSheet(overrides.map((override, index) => sheetRow({ 'Invoice Number': `INV-${index}`, ...override })));

test('one company under two Client IDs stays two customer accounts', () => {
  const rows = resolveCustomerAccounts(accountRows(
    { 'Company Name': 'Acme Logistics', 'Client ID': 'CL-1' },
    { 'Company Name': 'Acme Logistics', 'Client ID': 'CL-2' },
  ), []);
  assert.deepEqual(rows.map(r => [r.clientId, r.account]), [['CL-1', 'new'], ['CL-2', 'new']]);
  assert.ok(rows.every(r => r.errors.length === 0));
});

test('a Client ID already in the CRM adds the sale to that account', () => {
  const [row] = resolveCustomerAccounts(accountRows({ 'Client ID': 'cl-119' }), ['CL-119']);
  assert.equal(row.account, 'existing');
  assert.equal(row.firstTransaction, false);
});

test('a new Client ID opens its account once, and later rows in the file add to it', () => {
  const rows = resolveCustomerAccounts(accountRows({ 'Client ID': 'CL-9' }, { 'Client ID': 'CL-9' }), []);
  assert.deepEqual(rows.map(r => r.account), ['new', 'existing']);
});

test('First Transaction contradicting the Client ID is refused, never guessed', () => {
  const [alreadyOpen] = resolveCustomerAccounts(accountRows({ 'Client ID': 'CL-119', 'First Transaction': 'Yes' }), ['CL-119']);
  assert.match(alreadyOpen.errors[0], /Client ID CL-119 already has its first transaction/);

  const [unknownRepeat] = resolveCustomerAccounts(accountRows({ 'Client ID': 'CL-404', 'First Transaction': 'No' }), []);
  assert.match(unknownRepeat.errors[0], /not an existing customer account/);

  const twice = resolveCustomerAccounts(accountRows(
    { 'Client ID': 'CL-5', 'First Transaction': 'Yes' },
    { 'Client ID': 'CL-5', 'First Transaction': 'Yes' },
  ), []);
  assert.match(twice[1].errors[0], /already opens its account on row 2/);
});

test('without a Client ID, First Transaction is required and only Yes can be placed', () => {
  const [opens] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'First Transaction': 'Yes' }), []);
  assert.equal(opens.account, 'new');
  assert.equal(opens.errors.length, 0);

  const [repeat] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'First Transaction': 'No' }), []);
  assert.match(repeat.errors[0], /repeat sale needs the Client ID/);

  const [silent] = resolveCustomerAccounts(accountRows({ 'Client ID': '' }), []);
  assert.match(silent.errors[0], /First Transaction is required/);
});

test('a row that is already refused does not open an account for later rows', () => {
  const rows = resolveCustomerAccounts(accountRows(
    { 'Client ID': 'CL-3', 'Quantity': '0' },
    { 'Client ID': 'CL-3' },
  ), []);
  assert.equal(rows[0].account, undefined);
  assert.equal(rows[1].account, 'new', 'the first importable row opens it');
});
