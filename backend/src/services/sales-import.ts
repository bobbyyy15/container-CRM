/**
 * Mapping and validation for the sales spreadsheet the client already keeps.
 *
 * Kept free of any database client so the rules are unit-testable: the columns they use,
 * the values that are and are not acceptable, and which rows collide with each other. The
 * service layer adds what only the database knows -- whether a sale number or invoice
 * number is already taken -- and performs the writes.
 *
 * Money is never trusted from the sheet when it can be derived. Their file carries Total
 * Revenue and Profit columns, but those are products of quantity, buying rate and selling
 * price; a stale or hand-edited total would otherwise walk straight into the dashboard.
 * The computed figures win and any disagreement is reported on the row.
 */

/** One row as the spreadsheet gives it: header text to cell text. */
export type RawSalesRow = Record<string, unknown>;

export type MappedSaleRow = {
  rowNumber: number;
  saleNumber?: string;
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
  status: 'Pending' | 'Won' | 'Cancelled';
  remarks?: string;
  clientId?: string;
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
  invoicenumber: 'invoiceNumber', invoiceno: 'invoiceNumber', invoice: 'invoiceNumber', invoicenum: 'invoiceNumber',
  salenumber: 'saleNumber', saleno: 'saleNumber', wavenumber: 'saleNumber', wave: 'saleNumber', waveno: 'saleNumber',
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
  buyingrate: 'buyingRate', buyingprice: 'buyingRate', buyprice: 'buyingRate', buyingcostperunit: 'buyingRate', cost: 'buyingRate',
  totalrevenue: 'revenue', revenue: 'revenue', totalsell: 'revenue', totalsales: 'revenue',
  profit: 'grossProfit', grossprofit: 'grossProfit', totalprofit: 'grossProfit', margin: 'ignore',
  remarks: 'remarks', status: 'status', remarksstatus: 'status', statusremarks: 'status', notes: 'remarks',
  clientid: 'clientId', clientno: 'clientId', customerid: 'clientId',
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

  const saleNumber = get('saleNumber');
  if (saleNumber && !WAVE_PATTERN.test(saleNumber.toUpperCase())) {
    errors.push(`Sale Number "${saleNumber}" is not in WAVE format, e.g. WAVE-10317`);
  }

  const saleDateRaw = get('saleDate');
  const saleDate = readDate(saleDateRaw);
  if (saleDateRaw && !saleDate) errors.push(`Date "${saleDateRaw}" could not be read`);
  if (saleDate && new Date(saleDate).getTime() > Date.now() + 86_400_000) errors.push('Date is in the future');

  const typeRaw = get('type');
  const type = readType(typeRaw);
  if (typeRaw && !type) notices.push(`Type "${typeRaw}" is not a known container type and was left unset`);

  const { status, remark } = readStatus(get('status') ?? '');
  const remarks = get('remarks') ?? remark;

  // Derived, never taken from the sheet.
  const revenue = (sellingPrice ?? 0) * quantity;
  const buyingCost = (buyingRate ?? 0) * quantity;
  const grossProfit = revenue - buyingCost;

  const statedRevenue = readNumber(get('revenue'));
  if (statedRevenue !== undefined && Math.abs(statedRevenue - revenue) > MONEY_TOLERANCE) {
    notices.push(`Total Revenue in the sheet is ${statedRevenue}, recalculated as ${revenue} from quantity × selling price`);
  }
  const statedProfit = readNumber(get('grossProfit'));
  if (statedProfit !== undefined && Math.abs(statedProfit - grossProfit) > MONEY_TOLERANCE) {
    notices.push(`Profit in the sheet is ${statedProfit}, recalculated as ${grossProfit}`);
  }

  return {
    rowNumber,
    saleNumber: saleNumber?.toUpperCase(),
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
    revenue,
    buyingCost,
    grossProfit,
    status,
    remarks,
    clientId: get('clientId'),
    errors,
    notices,
  };
};

/**
 * Flags rows that repeat a sale number or an invoice number within the same file. The
 * first row keeps the number; the later ones are refused, so an import can never quietly
 * overwrite or double-count.
 */
export const markDuplicatesWithinFile = (rows: MappedSaleRow[]): MappedSaleRow[] => {
  const seenSale = new Map<string, number>();
  const seenInvoice = new Map<string, number>();
  for (const row of rows) {
    const sale = row.saleNumber?.toUpperCase();
    if (sale) {
      const first = seenSale.get(sale);
      if (first !== undefined) row.errors.push(`Sale Number ${sale} already appears on row ${first}`);
      else seenSale.set(sale, row.rowNumber);
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
