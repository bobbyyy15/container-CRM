/**
 * The money on a sale, and on its Masterpay record, in one place.
 *
 * A sale stores its totals (buying_cost, revenue, gross_profit); a person enters rates.
 * Every total is derived here from quantity and the two rates and rounded to the cent,
 * so a hand-typed or spreadsheet total can never reach the database or a dashboard.
 * Kept free of any database client so the arithmetic is unit-testable.
 */

const cents = (value: number) => Math.round(value * 100) / 100;

export type SaleFinancials = {
  quantity: number;
  buyingRate: number;
  sellingPrice: number;
  totalBuy: number;
  totalSell: number;
  profit: number;
  /** Profit as a percentage of Total Sell; 0 when nothing was sold for money. */
  margin: number;
};

/** Profit / Total Sell x 100, and 0 rather than Infinity or NaN when Total Sell is 0. */
export const profitMargin = (profit: number, totalSell: number) =>
  totalSell > 0 ? cents((profit / totalSell) * 100) : 0;

export const computeSaleFinancials = (quantity: number, buyingRate: number, sellingPrice: number): SaleFinancials => {
  const totalBuy = cents(quantity * buyingRate);
  const totalSell = cents(quantity * sellingPrice);
  const profit = cents(totalSell - totalBuy);
  return { quantity, buyingRate, sellingPrice, totalBuy, totalSell, profit, margin: profitMargin(profit, totalSell) };
};

/** The stored columns for a sale, from quantity and rates. */
export const saleTotalsColumns = (quantity: number, buyingRate: number, sellingPrice: number) => {
  const money = computeSaleFinancials(quantity, buyingRate, sellingPrice);
  return { buying_cost: money.totalBuy, revenue: money.totalSell, gross_profit: money.profit };
};

/** Rates recovered from stored totals, for a sale whose rates were not re-entered. */
export const ratesFromTotals = (quantity: number, buyingCost: number, revenue: number) => ({
  buyingRate: quantity ? cents(buyingCost / quantity) : 0,
  sellingPrice: quantity ? cents(revenue / quantity) : 0,
});

export const PAYMENT_STATUSES = ['Unpaid', 'Partially Paid', 'Paid'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export type MasterpayRecord = {
  payment_status?: string | null;
  payment_date?: string | null;
  payment_amount?: number | string | null;
  additional_markup?: number | string | null;
  credit?: number | string | null;
};

/**
 * Masterpay's Total Profit: the sale's profit, plus any additional mark-up charged on top,
 * less any credit given back to the customer.
 */
export const masterpayTotalProfit = (saleProfit: number, record?: MasterpayRecord | null) =>
  cents(saleProfit + Number(record?.additional_markup ?? 0) - Number(record?.credit ?? 0));

/**
 * PostgREST returns a one-to-one embed as an object, and as an array when it cannot prove
 * the relationship is one-to-one; either way a sale has at most one Masterpay record.
 */
export const masterpayRecordOf = <T extends MasterpayRecord>(embedded: T | T[] | null | undefined): T | null =>
  Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null;

/**
 * The payment a Sales Tracker row shows. Masterpay is the only place a payment date is
 * kept, so the sale reads it through from there; no Masterpay record means unpaid.
 */
export const paymentOf = (embedded: MasterpayRecord | MasterpayRecord[] | null | undefined) => {
  const record = masterpayRecordOf(embedded);
  return {
    payment_status: (record?.payment_status as PaymentStatus | undefined) ?? 'Unpaid',
    payment_date: record?.payment_date ?? null,
    payment_amount: record?.payment_amount != null ? Number(record.payment_amount) : null,
  };
};
