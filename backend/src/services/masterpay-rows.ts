/**
 * Masterpay rows, shaped from a sale and its payment record.
 *
 * Masterpay does not copy the sale: the invoice and release numbers, customer, contact,
 * container and money are read from the sale, its customer account and company, and only
 * the payment fields come from masterpay_records. Kept free of any database client so the
 * shaping is unit-testable.
 */
import type { UpsertMasterpayPayload } from '../schemas/deal.schema';
import { computeSaleFinancials, masterpayRecordOf, masterpayTotalProfit, paymentOf, type MasterpayRecord } from './sale-financials';

/** What Masterpay reads for each sale. */
export const MASTERPAY_SALE_SELECT = [
  'id, sale_number, invoice_number, sale_date, created_at, status, total_units, buying_cost, revenue, gross_profit, pic_id',
  'pics(name)',
  'customer_accounts(id, client_code, first_transaction_date)',
  'companies(id, name, address_street, address_city, address_state, address_country, company_contacts(is_primary, contacts(first_name, last_name, email_active, email_2, phone_direct, phone_2)))',
  'container_sizes(name), container_conditions(name), container_categories(code, name)',
  'quotations(contacts(first_name, last_name, email_active, phone_direct), inquiries(container_sizes!container_size_id(name), container_conditions!container_condition_id(name)))',
  'masterpay_records(*)',
].join(', ');

type Contact = { first_name?: string | null; last_name?: string | null; email_active?: string | null; email_2?: string | null; phone_direct?: string | null; phone_2?: string | null };

const fullName = (contact?: Contact | null) =>
  contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : '';

export const businessAddress = (company?: Record<string, string | null> | null) =>
  company ? [company.address_street, company.address_city, company.address_state, company.address_country].filter(Boolean).join(', ') : '';

/** A sale's contact: the one on its quotation, otherwise the company's primary contact. */
const contactOf = (sale: any): Contact | null => {
  if (sale.quotations?.contacts) return sale.quotations.contacts;
  const links = sale.companies?.company_contacts ?? [];
  return (links.find((link: any) => link.is_primary) ?? links[0])?.contacts ?? null;
};

export const toMasterpayRow = (sale: any) => {
  const record = masterpayRecordOf<MasterpayRecord & Record<string, any>>(sale.masterpay_records);
  const quantity = Number(sale.total_units || 0);
  const totalBuy = Number(sale.buying_cost || 0);
  const totalSell = Number(sale.revenue || 0);
  const money = computeSaleFinancials(quantity, quantity ? totalBuy / quantity : 0, quantity ? totalSell / quantity : 0);
  const profit = Number(sale.gross_profit ?? money.profit);
  const contact = contactOf(sale);
  const payment = paymentOf(record);

  return {
    saleId: sale.id,
    datePurchase: sale.sale_date ?? String(sale.created_at ?? '').slice(0, 10),
    pic: sale.pics?.name ?? '',
    customerAccountId: sale.customer_accounts?.id ?? null,
    customerId: sale.customer_accounts?.client_code ?? '',
    invoiceNumber: sale.invoice_number ?? '',
    releaseNumber: sale.sale_number ?? '',
    companyName: sale.companies?.name ?? '',
    contactPerson: fullName(contact),
    emailAddress: contact?.email_active ?? contact?.email_2 ?? '',
    contactNumber: contact?.phone_direct ?? contact?.phone_2 ?? '',
    businessAddress: businessAddress(sale.companies),
    quantity,
    size: sale.container_sizes?.name ?? sale.quotations?.inquiries?.container_sizes?.name ?? '',
    category: sale.container_categories?.code ?? sale.container_categories?.name ?? '',
    condition: sale.container_conditions?.name ?? sale.quotations?.inquiries?.container_conditions?.name ?? '',
    buyingPrice: money.buyingRate,
    sellingPrice: money.sellingPrice,
    totalBuy,
    totalSell,
    profit,
    additionalMarkup: Number(record?.additional_markup ?? 0),
    credit: Number(record?.credit ?? 0),
    totalProfit: masterpayTotalProfit(profit, record),
    saleStatus: sale.status,
    paymentStatus: payment.payment_status,
    paymentDate: payment.payment_date,
    paymentAmount: payment.payment_amount,
    vendorInvoiceReference: record?.vendor_invoice_reference ?? '',
    unitLocation: record?.unit_location ?? '',
    releaseDate: record?.release_date ?? null,
    remarks: record?.remarks ?? '',
    hasRecord: Boolean(record),
    updatedAt: record?.updated_at ?? null,
  };
};

/** The columns a Masterpay save writes. An unpaid record never keeps a payment date. */
export const masterpayColumns = (payload: UpsertMasterpayPayload) => ({
  payment_status: payload.paymentStatus,
  payment_date: payload.paymentStatus === 'Unpaid' ? null : payload.paymentDate ?? null,
  payment_amount: payload.paymentAmount ?? null,
  vendor_invoice_reference: payload.vendorInvoiceReference || null,
  unit_location: payload.unitLocation || null,
  additional_markup: payload.additionalMarkup ?? 0,
  credit: payload.credit ?? 0,
  release_date: payload.releaseDate ?? null,
  remarks: payload.remarks || null,
});

/**
 * A Sales Tracker row with its payment read through from Masterpay, flattened so the
 * screen reads payment_date and payment_status like any other column of the sale.
 */
export const withPayment = <T extends { masterpay_records?: unknown }>(sale: T) => {
  const { masterpay_records: embedded, ...rest } = sale;
  return { ...rest, ...paymentOf(embedded as MasterpayRecord | MasterpayRecord[] | null) };
};
