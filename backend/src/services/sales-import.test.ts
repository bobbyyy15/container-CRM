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
  normalizeEmail,
  normalizePhone,
  resolveCustomerAccounts,
  WAVE_PATTERN,
  type AccountIdentity,
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

/** An existing client, as the import is told about it. */
const client = (overrides: Partial<AccountIdentity> = {}): AccountIdentity => ({
  accountId: 'account-bowman',
  clientCode: 'CID-00012',
  companyName: 'K & T Bowman Trucking Inc',
  emails: ['kevin@bowman.test'],
  phones: ['7198920252'],
  ...overrides,
});

test('phones and emails are compared the way the database stores them', () => {
  assert.equal(normalizePhone('+1 (719) 892-0252'), '7198920252');
  assert.equal(normalizePhone('719.892.0252'), '7198920252');
  assert.equal(normalizePhone('555-12'), undefined, 'too short to identify anyone');
  assert.equal(normalizeEmail(' Kevin@Bowman.TEST '), 'kevin@bowman.test');
  assert.equal(normalizeEmail('not-an-email'), undefined);
});

test('a row with an existing client phone is that client repurchase', () => {
  const [row] = resolveCustomerAccounts(accountRows({ 'Contact Number': '+1 719 892 0252', 'Email Address': '', 'Client ID': '' }), [client()]);
  assert.equal(row.errors.length, 0, row.errors.join('; '));
  assert.equal(row.account, 'existing');
  assert.equal(row.firstTransaction, false);
  assert.equal(row.accountId, 'account-bowman');
});

test('a row with an existing client email is that client repurchase, whatever the case', () => {
  const [row] = resolveCustomerAccounts(accountRows({ 'Contact Number': '', 'Email Address': 'KEVIN@bowman.test', 'Client ID': '' }), [client()]);
  assert.equal(row.account, 'existing');
  assert.equal(row.accountLabel, 'K & T Bowman Trucking Inc');
});

test('a Customer ID from a Masterpay sheet places the row too', () => {
  const [row] = resolveCustomerAccounts(accountRows({ 'Client ID': 'cid-00012', 'Contact Number': '', 'Email Address': '' }), [client()]);
  assert.equal(row.account, 'existing');
  assert.equal(row.accountId, 'account-bowman');
});

test('a new client first transaction needs both phone and email', () => {
  const [both] = resolveCustomerAccounts(accountRows({ 'Client ID': '' }), []);
  assert.equal(both.account, 'new');
  assert.equal(both.firstTransaction, true);

  const [noEmail] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'Email Address': '' }), []);
  assert.match(noEmail.errors[0], /first transaction needs the customer's email/);

  const [neither] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'Email Address': '', 'Contact Number': '' }), []);
  assert.match(neither.errors[0], /needs the customer's phone and email/);
});

test('one company with two different contacts becomes two clients, not one merged by name', () => {
  const rows = resolveCustomerAccounts(accountRows(
    { 'Company Name': 'Acme Logistics', 'Contact Number': '(212) 555-0101', 'Email Address': 'ann@acme.test', 'Client ID': '' },
    { 'Company Name': 'Acme Logistics', 'Contact Number': '(212) 555-0202', 'Email Address': 'ben@acme.test', 'Client ID': '' },
  ), []);
  assert.deepEqual(rows.map(r => r.account), ['new', 'new']);
});

test('a later row with the same phone or email is a repurchase on the client the file opens', () => {
  const rows = resolveCustomerAccounts(accountRows(
    { 'Client ID': '' },
    { 'Client ID': '', 'Contact Number': '' },
  ), []);
  assert.deepEqual(rows.map(r => r.account), ['new', 'existing']);
  assert.equal(rows[1].openedOnRow, 2);
});

test('First Transaction contradicting the phone or email is refused, never guessed', () => {
  const [known] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'First Transaction': 'Yes' }), [client()]);
  assert.match(known.errors[0], /already belongs to existing client K & T Bowman Trucking Inc/);

  const [unknown] = resolveCustomerAccounts(accountRows({ 'Client ID': '', 'First Transaction': 'No' }), []);
  assert.match(unknown.errors[0], /no existing client has this phone or email/);
});

test('a phone and email that point at two different clients is refused', () => {
  const [row] = resolveCustomerAccounts(accountRows({ 'Client ID': '' }), [
    client({ accountId: 'a', companyName: 'By Phone Co', emails: [] }),
    client({ accountId: 'b', companyName: 'By Email Co', phones: [] }),
  ]);
  assert.match(row.errors[0], /matches more than one client/);
  assert.ok(row.errors[0].includes('By Phone Co') && row.errors[0].includes('By Email Co'), row.errors[0]);
  assert.equal(row.account, undefined, 'the row is not placed on either client');
});

test('a row that is already refused does not open a client for later rows', () => {
  const rows = resolveCustomerAccounts(accountRows(
    { 'Client ID': '', 'Quantity': '0' },
    { 'Client ID': '' },
  ), []);
  assert.equal(rows[0].account, undefined);
  assert.equal(rows[1].account, 'new', 'the first importable row opens it');
});
