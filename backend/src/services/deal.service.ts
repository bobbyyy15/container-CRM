import { supabaseAdmin } from '../config/supabase';
import { mapSalesSheet, normalizeEmail, normalizePhone, resolveCustomerAccounts, type AccountIdentity } from './sales-import';
import { findConditionId, findSizeId, type CatalogEntry } from './container-catalog';
import { saleTotalsColumns } from './sale-financials';
import { ConvertToSalePayload, CreateQuotationPayload, UpdateQuotationStatusPayload, CreateManualSalePayload, UpdateSalePayload, ImportSalesPayload } from '../schemas/deal.schema';

/** A database refusal worded for a person (P0001) keeps its own message. */
const saleError = (error: { code?: string; message: string }, fallback: string) =>
  new Error(error.code === 'P0001' ? error.message : `${fallback}: ${error.message}`);

export class DealService {

  static async updateQuotationStatus(quotationId: string, payload: UpdateQuotationStatusPayload, userId: string) {
    const { data: quote, error } = await supabaseAdmin
      .rpc('update_quotation_status', {
        p_quotation_id: quotationId,
        p_actor_id: userId,
        p_status: payload.status,
      })
      .single();
    if (error) throw new Error(`Failed to update quotation status: ${error.message}`);
    return quote;
  }

  static async createQuotation(payload: CreateQuotationPayload, userId: string) {
    const { data: quote, error } = await supabaseAdmin
      .rpc('create_quotation_from_inquiry', {
        p_inquiry_id: payload.inquiry_id,
        p_items: payload.items,
        p_actor_id: userId,
        p_valid_until: payload.valid_until ?? null,
        p_notes: payload.notes ?? null,
      })
      .single();
    if (error) throw new Error(`Failed to create quotation: ${error.message}`);
    return quote;
  }

  /**
   * Money on a sale is always quantity x rate. The client's spreadsheet carries its own
   * Total Revenue and Profit columns and an edit form could offer them too, but a figure
   * that can be derived is derived -- a stale total would otherwise flow into every
   * dashboard as fact.
   */
  static recalculate(totalUnits: number, buyingRate: number, sellingPrice: number) {
    return saleTotalsColumns(totalUnits, buyingRate, sellingPrice);
  }

  /**
   * Updates an existing sale in place, recalculating the money from whatever the request
   * changed. Ownership follows the same rule as deleting: an admin may edit any sale, a
   * sales manager only their own PIC's.
   */
  static async updateSale(id: string, payload: UpdateSalePayload, actor: { role?: string; picId?: string | null }) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('sales')
      .select('id, pic_id, total_units, buying_cost, revenue, sale_number')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw Object.assign(new Error('Sale not found.'), { status: 404 });
    if (actor.role !== 'admin' && (!actor.picId || existing.pic_id !== actor.picId)) {
      throw Object.assign(new Error('You can only edit sales owned by your own PIC.'), { status: 403 });
    }

    const units = payload.totalUnits ?? existing.total_units ?? 1;
    // Rates are what the form edits; the stored columns are totals, so derive the current
    // rate when the request does not name a new one.
    const currentBuyingRate = existing.total_units ? Number(existing.buying_cost) / existing.total_units : 0;
    const currentSellingPrice = existing.total_units ? Number(existing.revenue) / existing.total_units : 0;
    const buyingRate = payload.buyingRate ?? currentBuyingRate;
    const sellingPrice = payload.sellingPrice ?? currentSellingPrice;

    const update: Record<string, unknown> = {
      ...DealService.recalculate(units, buyingRate, sellingPrice),
      total_units: units,
      updated_at: new Date().toISOString(),
    };
    if (payload.invoiceNumber !== undefined) update.invoice_number = payload.invoiceNumber || null;
    // The Release Number lives in sale_number.
    if (payload.releaseNumber !== undefined) update.sale_number = payload.releaseNumber;
    if (payload.saleDate !== undefined) update.sale_date = payload.saleDate || null;
    if (payload.containerSizeId !== undefined) update.container_size_id = payload.containerSizeId;
    if (payload.containerConditionId !== undefined) update.container_condition_id = payload.containerConditionId;
    if (payload.containerCategoryId !== undefined) update.container_category_id = payload.containerCategoryId;
    if (payload.picId !== undefined) update.pic_id = payload.picId;
    if (payload.status !== undefined) update.status = payload.status;

    const { data, error } = await supabaseAdmin.from('sales').update(update).eq('id', id).select('*').single();
    if (error) {
      // 23505 is a unique violation: the release number is already on another sale.
      if ((error as { code?: string }).code === '23505') {
        throw Object.assign(new Error(`Release number ${payload.releaseNumber} is already used by another sale.`), { status: 409 });
      }
      throw error;
    }
    return data;
  }

  /**
   * Imports the client's sales spreadsheet.
   *
   * Runs as a preview first (`dryRun`), reporting every row's outcome -- what it mapped to,
   * which customer account it lands on, what is wrong with it, and whether it duplicates a
   * sale already on record or another row in the file -- so nothing is written until
   * someone has seen it. Committing skips every row that has an error, so an import can
   * never partially overwrite an existing sale: a duplicate is refused, never merged.
   */
  static async importSales(payload: ImportSalesPayload, actorId: string, picId: string | null) {
    const rows = mapSalesSheet(payload.rows);

    const releaseNumbers = rows.map(r => r.releaseNumber).filter((v): v is string => Boolean(v));
    const invoiceNumbers = rows.map(r => r.invoiceNumber).filter((v): v is string => Boolean(v));

    const [existingReleases, existingInvoices, accounts, categories, sizes, conditions] = await Promise.all([
      releaseNumbers.length
        ? supabaseAdmin.from('sales').select('sale_number').in('sale_number', releaseNumbers)
        : Promise.resolve({ data: [] as { sale_number: string }[], error: null }),
      invoiceNumbers.length
        ? supabaseAdmin.from('sales').select('invoice_number').in('invoice_number', invoiceNumbers)
        : Promise.resolve({ data: [] as { invoice_number: string }[], error: null }),
      // Every account with the contact it is known by, so a row's phone or email finds its client.
      supabaseAdmin.from('customer_accounts').select('id, client_code, companies(name), contacts(email_active, email_2, phone_direct, phone_2)'),
      supabaseAdmin.from('container_categories').select('id, code, name'),
      supabaseAdmin.from('container_sizes').select('id, name'),
      supabaseAdmin.from('container_conditions').select('id, name'),
    ]);
    const failed = [existingReleases, existingInvoices, accounts, categories, sizes, conditions].find(result => result.error);
    if (failed?.error) throw failed.error;

    const takenRelease = new Set((existingReleases.data ?? []).map(r => String(r.sale_number).toUpperCase()));
    const takenInvoice = new Set((existingInvoices.data ?? []).map(r => String(r.invoice_number).toUpperCase()));
    const byCode = new Map((categories.data ?? []).map(c => [String(c.code ?? '').toUpperCase(), c.id]));
    const sizeCatalog = (sizes.data ?? []) as CatalogEntry[];
    const conditionCatalog = (conditions.data ?? []) as CatalogEntry[];

    for (const row of rows) {
      if (row.releaseNumber && takenRelease.has(row.releaseNumber.toUpperCase())) {
        row.errors.push(`Release Number ${row.releaseNumber} already exists in the CRM`);
      }
      if (row.invoiceNumber && takenInvoice.has(row.invoiceNumber.toUpperCase())) {
        row.errors.push(`Invoice Number ${row.invoiceNumber} is already on another sale`);
      }
      if (row.size && !findSizeId(row.size, sizeCatalog)) {
        row.notices.push(`Size "${row.size}" is not in the catalog and was left unset`);
      }
      if (row.condition && !findConditionId(row.condition, conditionCatalog)) {
        row.notices.push(`Condition "${row.condition}" is not in the catalog and was left unset`);
      }
    }

    // Last, so a row refused for any other reason never opens an account.
    const identities: AccountIdentity[] = ((accounts.data ?? []) as any[]).map(account => {
      const contact = Array.isArray(account.contacts) ? account.contacts[0] : account.contacts;
      const company = Array.isArray(account.companies) ? account.companies[0] : account.companies;
      return {
        accountId: account.id,
        clientCode: account.client_code ?? undefined,
        companyName: company?.name ?? 'an existing client',
        emails: [contact?.email_active, contact?.email_2].map(normalizeEmail).filter((v): v is string => Boolean(v)),
        phones: [contact?.phone_direct, contact?.phone_2].map(normalizePhone).filter((v): v is string => Boolean(v)),
      };
    });
    resolveCustomerAccounts(rows, identities);

    const importable = rows.filter(row => row.errors.length === 0);
    const summary = {
      total: rows.length,
      importable: importable.length,
      rejected: rows.length - importable.length,
      imported: 0,
      newAccounts: importable.filter(row => row.account === 'new').length,
    };

    if (payload.dryRun) return { summary, rows, committed: false };

    // In sheet order, so a repurchase on an account opened earlier in the file finds it.
    const openedAccounts = new Map<number, string>();
    for (const row of importable) {
      const accountId = row.account === 'existing'
        ? row.accountId ?? (row.openedOnRow ? openedAccounts.get(row.openedOnRow) : undefined)
        : undefined;
      if (row.account === 'existing' && !accountId) {
        row.errors.push(`Its client was to be opened on row ${row.openedOnRow}, which was not imported`);
        continue;
      }
      const { data, error } = await supabaseAdmin.rpc('create_manual_sale', {
        p_actor_id: actorId,
        p_company_name: row.companyName,
        p_contact_person: row.contactPerson ?? null,
        p_phone: row.phone ?? null,
        p_email: row.email ?? null,
        p_pic_id: picId,
        p_total_units: row.quantity,
        p_buying_cost: row.buyingCost,
        p_revenue: row.revenue,
        p_state_province: row.state ?? null,
        p_country: null,
        p_city: row.city ?? null,
        p_container_size_id: row.size ? findSizeId(row.size, sizeCatalog) ?? null : null,
        p_container_condition_id: row.condition ? findConditionId(row.condition, conditionCatalog) ?? null : null,
        p_sale_date: row.saleDate ?? null,
        p_sale_number: row.releaseNumber ?? null,
        p_invoice_number: row.invoiceNumber ?? null,
        p_container_category_id: row.type ? byCode.get(row.type) ?? null : null,
        p_status: row.status,
        p_first_transaction: row.account === 'new',
        p_customer_account_id: accountId ?? null,
        // A Customer ID in the sheet names the new account; a repurchase is placed by id.
        p_client_code: row.account === 'new' ? row.clientId ?? null : null,
      });
      if (error) {
        row.errors.push(error.message);
        continue;
      }
      summary.imported += 1;
      const sale = (Array.isArray(data) ? data[0] : data) as { customer_account_id?: string } | null;
      if (row.account === 'new' && sale?.customer_account_id) openedAccounts.set(row.rowNumber, sale.customer_account_id);
    }
    summary.rejected = rows.length - summary.imported;

    return { summary, rows, committed: true };
  }

  static async createManualSale(payload: CreateManualSalePayload, userId: string) {
    const totals = saleTotalsColumns(payload.totalUnits, payload.buyingRate, payload.sellingPrice);
    const { data: sale, error } = await supabaseAdmin
      .rpc('create_manual_sale', {
        p_actor_id: userId,
        p_company_name: payload.companyName ?? null,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_pic_id: payload.picId ?? null,
        p_total_units: payload.totalUnits,
        p_buying_cost: totals.buying_cost,
        p_revenue: totals.revenue,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_city: payload.city ?? null,
        p_container_size_id: payload.containerSizeId ?? null,
        p_container_condition_id: payload.containerConditionId ?? null,
        p_sale_date: payload.saleDate ?? null,
        p_sale_number: payload.releaseNumber ?? null,
        p_invoice_number: payload.invoiceNumber ?? null,
        p_container_category_id: payload.containerCategoryId ?? null,
        p_status: payload.status ?? 'Won',
        p_first_transaction: payload.firstTransaction,
        p_customer_account_id: payload.customerAccountId ?? null,
        p_client_code: payload.clientCode ?? null,
      })
      .single();
    if (error) throw saleError(error, 'Failed to create sale');
    const convertedCompanyId = (sale as { company_id?: string } | null)?.company_id;
    if (convertedCompanyId) {
      await supabaseAdmin
        .from('prospect_clients')
        .update({ lifecycle_status: 'converted', converted_at: new Date().toISOString() })
        .eq('company_id', convertedCompanyId)
        .eq('lifecycle_status', 'active');
    }
    return sale;
  }

  static async convertToSale(quotationId: string, payload: ConvertToSalePayload, userId: string) {
    const totals = saleTotalsColumns(payload.total_units, payload.buying_rate, payload.selling_price);
    const { data: sale, error } = await supabaseAdmin
      .rpc('convert_quotation_to_sale', {
        p_quotation_id: quotationId,
        p_actor_id: userId,
        p_total_units: payload.total_units,
        p_buying_cost: totals.buying_cost,
        p_revenue: totals.revenue,
        p_first_transaction: payload.first_transaction ?? null,
        p_customer_account_id: payload.customer_account_id ?? null,
        p_client_code: payload.client_code ?? null,
        p_sale_date: payload.sale_date ?? null,
      })
      .single();
    if (error) throw saleError(error, 'Failed to record sale');
    const convertedCompanyId = (sale as { company_id?: string } | null)?.company_id;
    if (convertedCompanyId) {
      await supabaseAdmin
        .from('prospect_clients')
        .update({ lifecycle_status: 'converted', converted_at: new Date().toISOString() })
        .eq('company_id', convertedCompanyId)
        .eq('lifecycle_status', 'active');
    }
    return sale;
  }

}
