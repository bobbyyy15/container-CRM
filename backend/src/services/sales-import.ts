/**
 * Mapping and validation for the sales spreadsheet the client already keeps.
 *
 * Kept free of any database client so the rules are unit-testable: the columns they use,
 * the values that are and are not acceptable, and which rows collide with each other. The
 * service layer adds what only the database knows -- whether a release number, invoice
 * number or Client ID is already on file -- and performs the writes.
 *
 * Money is never trusted from the sheet when it can be derived. Their file carries Total
 * Revenue and Profit columns, but those are products of quantity, buying rate and selling
 * price; a stale or hand-edited total would otherwise walk straight into the dashboard.
 * The computed figures win and any disagreement is reported on the row.
 */
import { computeSaleFinancials } from './sale-financials';

/** One row as the spreadsheet gives it: header text to cell text. */
export type RawSalesRow = Record<string, unknown>;

export type MappedSaleRow = {
  rowNumber: number;
  /** The release reference, stored in sales.sale_number and shown as Release Number. */
  releaseNumber?: string;
  invoiceNumber?: string;
  saleDate?: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  state?: string;
  city?: string;
  quantity: number;
  type?: string;
  condition?: string;
  size?: string;
  sellingPrice: number;
  buyingRate: number;
  revenue: number;
  buyingCost: number;
  grossProfit: number;
  margin: number;
  status: 'Pending' | 'Won' | 'Cancelled';
  remarks?: string;
  /** The customer account's Client ID, when the sheet gives one. */
  clientId?: string;
  /** What the sheet's First Transaction column says, when it has one. */
  firstTransaction?: boolean;
  /** How the sale attaches to a customer account, once resolved against the CRM. */
  account?: 'new' | 'existing';
  /** The existing account a repurchase lands on, when it is already in the CRM. */
  accountId?: string;
  /** Who the account is, for the preview. */
  accountLabel?: string;
  /** A repurchase on an account that an earlier row of the same file opens. */
  openedOnRow?: number;
  /** Anything wrong with this row. A row with errors is never imported. */
  errors: string[];
  /** Worth saying, but not a reason to refuse the row. */
  notices: string[];
};

const clean = (value: unknown) => String(value ?? '').trim();

/** Header text reduced to a comparison key: "Selling Price " and "selling_price" match. */
const headerKey = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMN_ALIASES: Record<string, keyof MappedSaleRow | 'ignore'> = {
  date: 'saleDate', saledate: 'saleDate', dateofsale: 'saleDate', transactiondate: 'saleDate',
  datepurchase: 'saleDate', purchasedate: 'saleDate', datepurchased: 'saleDate',
  invoicenumber: 'invoiceNumber', invoiceno: 'invoiceNumber', invoice: 'invoiceNumber', invoicenum: 'invoiceNumber',
  releasenumber: 'releaseNumber', releaseno: 'releaseNumber', releaseref: 'releaseNumber', releasereference: 'releaseNumber',
  release: 'releaseNumber', releasenum: 'releaseNumber',
  // What the CRM used to label Sale Number is the release reference; older sheets still say so.
  salenumber: 'releaseNumber', saleno: 'releaseNumber', wavenumber: 'releaseNumber', wave: 'releaseNumber', waveno: 'releaseNumber',
  companyname: 'companyName', company: 'companyName', client: 'companyName', clientname: 'companyName', customer: 'companyName',
  contactperson: 'contactPerson', contact: 'contactPerson', contactname: 'contactPerson', fullname: 'contactPerson',
  contactnumber: 'phone', phone: 'phone', phonenumber: 'phone', mobile: 'phone', telephone: 'phone', contactno: 'phone',
  emailaddress: 'email', email: 'email',
  state: 'state', stateprovince: 'state', province: 'state',
  city: 'city', town: 'city',
  quantity: 'quantity', qty: 'quantity', units: 'quantity', totalunits: 'quantity',
  type: 'type', containertype: 'type', category: 'type', containercategory: 'type',
  condition: 'condition', containercondition: 'condition',
  size: 'size', containersize: 'size',
  sellingprice: 'sellingPrice', sellprice: 'sellingPrice', sellingrate: 'sellingPrice', priceperunit: 'sellingPrice', unitprice: 'sellingPrice',
  sellperunit: 'sellingPrice',
  buyingrate: 'buyingRate', buyingprice: 'buyingRate', buyprice: 'buyingRate', buyingcostperunit: 'buyingRate', cost: 'buyingRate',
  buyperunit: 'buyingRate',
  totalrevenue: 'revenue', revenue: 'revenue', totalsell: 'revenue', totalsales: 'revenue', totalsr: 'revenue',
  profit: 'grossProfit', grossprofit: 'grossProfit', totalprofit: 'grossProfit', margin: 'ignore', profitmargin: 'ignore',
  remarks: 'remarks', status: 'status', remarksstatus: 'status', statusremarks: 'status', notes: 'remarks',
  clientid: 'clientId', clientno: 'clientId', customerid: 'clientId', clientcode: 'clientId', accountid: 'clientId',
  firsttransaction: 'firstTransaction', firsttxn: 'firstTransaction', firstpurchase: 'firstTransaction',
  newaccount: 'firstTransaction', newcustomer: 'firstTransaction',
};

/**
 * What the sheet's Remarks / Status column means for the sale.
 *
 * Their file mixes an outcome with a note, so anything unrecognised is kept as a remark
 * and the sale is treated as Won -- these are sales they have already made. Cancelled and
 * pending wording is recognised explicitly because those must not count as revenue.
 */
export const readStatus = (value: string): { status: MappedSaleRow['status']; remark?: string } => {
  const text = value.trim();
  const key = text.toLowerCase();
  if (!key) return { status: 'Won' };
  if (/(^|\b)(cancel|cancelled|canceled|void|voided|refund(ed)?)(\b|$)/.test(key)) return { status: 'Cancelled', remark: text };
  if (/(^|\b)(pending|hold|on hold|reserved|unpaid|processing)(\b|$)/.test(key)) return { status: 'Pending', remark: text };
  if (/(^|\b)(won|closed|complete[d]?|paid|delivered|sold)(\b|$)/.test(key)) return { status: 'Won', remark: text };
  return { status: 'Won', remark: text };
};

/** "$1,200.50" and " 1200.5 " both read as 1200.5; blank reads as undefined. */
export const readNumber = (value: unknown): number | undefined => {
  const text = clean(value).replace(/[$,\s]/g, '');
  if (!text) return undefined;
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number(negative ? text.replace(/[()]/g, '') : text);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
};

/** Yes / No, in the words a sheet uses for it; undefined when it is neither. */
export const readYesNo = (value: unknown): boolean | undefined => {
  const key = clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['yes', 'y', 'true', '1', 'new', 'first', 'firsttransaction', 'newaccount', 'newcustomer'].includes(key)) return true;
  if (['no', 'n', 'false', '0', 'repeat', 'existing', 'returning', 'repeatcustomer'].includes(key)) return false;
  return undefined;
};

/** Accepts what spreadsheets produce: ISO, US, and Excel's day-number serials. */
export const readDate = (value: unknown): string | undefined => {
  const text = clean(value);
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    // Excel counts days from 1899-12-30 (its leap-year bug included).
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const iso = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
};

export const WAVE_PATTERN = /^WAVE-\d{3,10}$/;

/** Their shorthand, and the catalog names it corresponds to. */
export const TYPE_ALIASES: Record<string, string> = {
  dc: 'DC', dry: 'DC', drycontainer: 'DC', drycargo: 'DC', gp: 'DC', generalpurpose: 'DC',
  dd: 'DD', doubledoor: 'DD', doubledoors: 'DD',
  os: 'OS', openside: 'OS', opensided: 'OS',
  ot: 'OT', opentop: 'OT',
  fr: 'FR', flatrack: 'FR', flat: 'FR',
  rf: 'RF', reefer: 'RF', refrigerated: 'RF', refer: 'RF',
  hc: 'HC', highcube: 'HC', hicube: 'HC',
};

/** Resolves a sheet's Type cell to a catalog code, or undefined when it is unfamiliar. */
export const readType = (value: unknown): string | undefined =>
  TYPE_ALIASES[clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')];

/** Which mapped field each column of the sheet feeds, by header text. */
export const mapHeaders = (headers: unknown[]): (keyof MappedSaleRow | 'ignore' | undefined)[] =>
  headers.map(header => COLUMN_ALIASES[headerKey(header)]);

const MONEY_TOLERANCE = 0.5;

/**
 * Maps and validates one row. `rowNumber` is the line in the sheet, so an error can point
 * at the row the person is looking at.
 */
export const mapSaleRow = (raw: RawSalesRow, rowNumber: number): MappedSaleRow => {
  const byField = new Map<string, string>();
  for (const [header, value] of Object.entries(raw)) {
    const field = COLUMN_ALIASES[headerKey(header)];
    if (!field || field === 'ignore') continue;
    const text = clean(value);
    if (text && !byField.has(field)) byField.set(field, text);
  }

  const errors: string[] = [];
  const notices: string[] = [];
  const get = (field: string) => byField.get(field);

  const companyName = get('companyName') ?? '';
  if (!companyName) errors.push('Company Name is required');

  const quantity = readNumber(get('quantity')) ?? 0;
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('Quantity must be a whole number of at least 1');

  const sellingPrice = readNumber(get('sellingPrice'));
  const buyingRate = readNumber(get('buyingRate'));
  if (sellingPrice === undefined) errors.push('Selling Price is required');
  else if (sellingPrice < 0) errors.push('Selling Price cannot be negative');
  if (buyingRate === undefined) errors.push('Buying Rate is required');
  else if (buyingRate < 0) errors.push('Buying Rate cannot be negative');

  const releaseNumber = get('releaseNumber');
  if (releaseNumber && !WAVE_PATTERN.test(releaseNumber.toUpperCase())) {
    errors.push(`Release Number "${releaseNumber}" is not in WAVE format, e.g. WAVE-10317`);
  }

  const saleDateRaw = get('saleDate');
  const saleDate = readDate(saleDateRaw);
  if (saleDateRaw && !saleDate) errors.push(`Date "${saleDateRaw}" could not be read`);
  if (saleDate && new Date(saleDate).getTime() > Date.now() + 86_400_000) errors.push('Date is in the future');

  const typeRaw = get('type');
  const type = readType(typeRaw);
  if (typeRaw && !type) notices.push(`Type "${typeRaw}" is not a known container type and was left unset`);

  const firstTransactionRaw = get('firstTransaction');
  const firstTransaction = readYesNo(firstTransactionRaw);
  if (firstTransactionRaw && firstTransaction === undefined) {
    errors.push(`First Transaction "${firstTransactionRaw}" must be Yes or No`);
  }

  const { status, remark } = readStatus(get('status') ?? '');
  const remarks = get('remarks') ?? remark;

  // Derived, never taken from the sheet.
  const money = computeSaleFinancials(quantity, buyingRate ?? 0, sellingPrice ?? 0);

  const statedRevenue = readNumber(get('revenue'));
  if (statedRevenue !== undefined && Math.abs(statedRevenue - money.totalSell) > MONEY_TOLERANCE) {
    notices.push(`Total Revenue in the sheet is ${statedRevenue}, recalculated as ${money.totalSell} from quantity × selling price`);
  }
  const statedProfit = readNumber(get('grossProfit'));
  if (statedProfit !== undefined && Math.abs(statedProfit - money.profit) > MONEY_TOLERANCE) {
    notices.push(`Profit in the sheet is ${statedProfit}, recalculated as ${money.profit}`);
  }

  return {
    rowNumber,
    releaseNumber: releaseNumber?.toUpperCase(),
    invoiceNumber: get('invoiceNumber'),
    saleDate,
    companyName,
    contactPerson: get('contactPerson'),
    phone: get('phone'),
    email: get('email'),
    state: get('state'),
    city: get('city'),
    quantity,
    type,
    condition: get('condition'),
    size: get('size'),
    sellingPrice: sellingPrice ?? 0,
    buyingRate: buyingRate ?? 0,
    revenue: money.totalSell,
    buyingCost: money.totalBuy,
    grossProfit: money.profit,
    margin: money.margin,
    status,
    remarks,
    clientId: get('clientId'),
    firstTransaction,
    errors,
    notices,
  };
};

/**
 * Flags rows that repeat a release number or an invoice number within the same file. The
 * first row keeps the number; the later ones are refused, so an import can never quietly
 * overwrite or double-count.
 */
export const markDuplicatesWithinFile = (rows: MappedSaleRow[]): MappedSaleRow[] => {
  const seenRelease = new Map<string, number>();
  const seenInvoice = new Map<string, number>();
  for (const row of rows) {
    const release = row.releaseNumber?.toUpperCase();
    if (release) {
      const first = seenRelease.get(release);
      if (first !== undefined) row.errors.push(`Release Number ${release} already appears on row ${first}`);
      else seenRelease.set(release, row.rowNumber);
    }
    const invoice = row.invoiceNumber?.toUpperCase();
    if (invoice) {
      const first = seenInvoice.get(invoice);
      if (first !== undefined) row.errors.push(`Invoice Number ${row.invoiceNumber} already appears on row ${first}`);
      else seenInvoice.set(invoice, row.rowNumber);
    }
  }
  return rows;
};

export const mapSalesSheet = (rows: RawSalesRow[]): MappedSaleRow[] =>
  markDuplicatesWithinFile(rows.map((raw, index) => mapSaleRow(raw, index + 2)));

/** An email as the database compares it: trimmed and lower-cased. */
export const normalizeEmail = (value: unknown): string | undefined => {
  const text = clean(value).toLowerCase();
  return text.includes('@') ? text : undefined;
};

/**
 * A phone as it is matched: its last ten digits, so "+1 (719) 892-0252" and "719.892.0252"
 * are the same number. Fewer than seven digits is not enough to identify anyone.
 */
export const normalizePhone = (value: unknown): string | undefined => {
  const digits = clean(value).replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : undefined;
};

/** An existing customer account, as the import can recognise it. */
export type AccountIdentity = {
  accountId: string;
  clientCode?: string;
  companyName: string;
  emails: string[];
  phones: string[];
};

/**
 * Decides which customer account every importable row belongs to, the way the client
 * works: a customer is known by their phone and email.
 *
 * - A row whose phone or email belongs to an existing client is that client's repurchase.
 *   A Customer ID already in the CRM (Masterpay sheets carry one) places it the same way.
 * - Otherwise the row is a first transaction and opens a new account, which needs both a
 *   phone and an email. A later row in the same file with that phone or email is then a
 *   repurchase on it.
 * - A phone or email that matches two different clients cannot be placed safely, so the row
 *   is refused rather than guessed.
 *
 * A First Transaction column, when the sheet has one, must agree. Rows that already carry
 * an error are left alone -- they will not be imported, so they must not open an account
 * that a later row would then depend on. Nothing is ever matched by company name: one
 * company can hold several accounts.
 */
export const resolveCustomerAccounts = (rows: MappedSaleRow[], existingAccounts: AccountIdentity[]): MappedSaleRow[] => {
  const index = <K extends 'emails' | 'phones'>(key: K) => {
    const map = new Map<string, AccountIdentity[]>();
    for (const account of existingAccounts) {
      for (const value of account[key]) map.set(value, [...(map.get(value) ?? []), account]);
    }
    return map;
  };
  const byEmail = index('emails');
  const byPhone = index('phones');
  const byCode = new Map(existingAccounts.filter(a => a.clientCode).map(a => [a.clientCode!.trim().toUpperCase(), a]));

  // Accounts opened earlier in this file, by the identities that will find them again.
  const openedByEmail = new Map<string, MappedSaleRow>();
  const openedByPhone = new Map<string, MappedSaleRow>();

  for (const row of rows) {
    if (row.errors.length) continue;
    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone);
    const code = row.clientId?.trim().toUpperCase();

    const matches = [
      ...(code && byCode.has(code) ? [byCode.get(code)!] : []),
      ...(email ? byEmail.get(email) ?? [] : []),
      ...(phone ? byPhone.get(phone) ?? [] : []),
    ].filter((account, position, all) => all.findIndex(other => other.accountId === account.accountId) === position);
    const openedEarlier = (email && openedByEmail.get(email)) || (phone && openedByPhone.get(phone)) || undefined;

    if (matches.length > 1) {
      row.errors.push(`The phone or email matches more than one client (${matches.map(m => m.companyName).join(', ')}); give the Customer ID to choose`);
      continue;
    }

    const existing = matches[0];
    if (existing || openedEarlier) {
      if (row.firstTransaction === true) {
        row.errors.push(existing
          ? `This phone or email already belongs to existing client ${existing.companyName}; it is a repurchase, not a first transaction`
          : `This phone or email opens its client on row ${openedEarlier!.rowNumber}; this row is a repurchase, not a first transaction`);
        continue;
      }
      row.account = 'existing';
      row.firstTransaction = false;
      if (existing) {
        row.accountId = existing.accountId;
        row.accountLabel = existing.companyName;
      } else {
        row.openedOnRow = openedEarlier!.rowNumber;
        row.accountLabel = openedEarlier!.companyName;
      }
      continue;
    }

    if (row.firstTransaction === false) {
      row.errors.push('Marked as a repurchase, but no existing client has this phone or email');
      continue;
    }

    const missing = [!phone && 'phone', !email && 'email'].filter(Boolean);
    if (missing.length) {
      row.errors.push(`A new client's first transaction needs the customer's ${missing.join(' and ')}`);
      continue;
    }

    row.account = 'new';
    row.firstTransaction = true;
    row.accountLabel = row.companyName;
    openedByEmail.set(email!, row);
    openedByPhone.set(phone!, row);
  }
  return rows;
};
