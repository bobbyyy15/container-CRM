import { supabaseAdmin } from '../config/supabase';
import { mapSalesSheet } from './sales-import';
import { ConvertToSalePayload, CreateQuotationPayload, UpdateQuotationStatusPayload, CreateManualSalePayload, UpdateSalePayload, ImportSalesPayload } from '../schemas/deal.schema';

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
    const revenue = sellingPrice * totalUnits;
    const buyingCost = buyingRate * totalUnits;
    return { revenue, buying_cost: buyingCost, gross_profit: revenue - buyingCost };
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
    if (payload.saleNumber !== undefined) update.sale_number = payload.saleNumber;
    if (payload.invoiceNumber !== undefined) update.invoice_number = payload.invoiceNumber || null;
    if (payload.saleDate !== undefined) update.sale_date = payload.saleDate || null;
    if (payload.containerSizeId !== undefined) update.container_size_id = payload.containerSizeId;
    if (payload.containerConditionId !== undefined) update.container_condition_id = payload.containerConditionId;
    if (payload.containerCategoryId !== undefined) update.container_category_id = payload.containerCategoryId;
    if (payload.picId !== undefined) update.pic_id = payload.picId;
    if (payload.status !== undefined) update.status = payload.status;

    const { data, error } = await supabaseAdmin.from('sales').update(update).eq('id', id).select('*').single();
    if (error) {
      // 23505 is a unique violation: the sale number is already on another sale.
      if ((error as { code?: string }).code === '23505') {
        throw Object.assign(new Error(`Sale number ${payload.saleNumber} is already used by another sale.`), { status: 409 });
      }
      throw error;
    }
    return data;
  }

  /**
   * Imports the client's sales spreadsheet.
   *
   * Runs as a preview first (`dryRun`), reporting every row's outcome -- what it mapped to,
   * what is wrong with it, and whether it duplicates a sale already on record or another
   * row in the file -- so nothing is written until someone has seen it. Committing skips
   * every row that has an error, so an import can never partially overwrite an existing
   * sale: a duplicate is refused, never merged.
   */
  static async importSales(payload: ImportSalesPayload, actorId: string, picId: string | null) {
    const rows = mapSalesSheet(payload.rows);

    const saleNumbers = rows.map(r => r.saleNumber).filter((v): v is string => Boolean(v));
    const invoiceNumbers = rows.map(r => r.invoiceNumber).filter((v): v is string => Boolean(v));

    const [existingSales, existingInvoices, categories, sizes, conditions] = await Promise.all([
      saleNumbers.length
        ? supabaseAdmin.from('sales').select('sale_number').in('sale_number', saleNumbers)
        : Promise.resolve({ data: [] as { sale_number: string }[] }),
      invoiceNumbers.length
        ? supabaseAdmin.from('sales').select('invoice_number').in('invoice_number', invoiceNumbers)
        : Promise.resolve({ data: [] as { invoice_number: string }[] }),
      supabaseAdmin.from('container_categories').select('id, code, name'),
      supabaseAdmin.from('container_sizes').select('id, name'),
      supabaseAdmin.from('container_conditions').select('id, name'),
    ]);

    const takenSale = new Set((existingSales.data ?? []).map(r => String(r.sale_number).toUpperCase()));
    const takenInvoice = new Set((existingInvoices.data ?? []).map(r => String(r.invoice_number).toUpperCase()));
    const byCode = new Map((categories.data ?? []).map(c => [String(c.code ?? '').toUpperCase(), c.id]));
    const sizeByName = new Map((sizes.data ?? []).map(s => [String(s.name).toLowerCase(), s.id]));
    const conditionByName = new Map((conditions.data ?? []).map(c => [String(c.name).toLowerCase(), c.id]));

    for (const row of rows) {
      if (row.saleNumber && takenSale.has(row.saleNumber.toUpperCase())) {
        row.errors.push(`Sale Number ${row.saleNumber} already exists in the CRM`);
      }
      if (row.invoiceNumber && takenInvoice.has(row.invoiceNumber.toUpperCase())) {
        row.errors.push(`Invoice Number ${row.invoiceNumber} is already on another sale`);
      }
      if (row.size && !sizeByName.has(row.size.toLowerCase())) {
        row.notices.push(`Size "${row.size}" is not in the catalog and was left unset`);
      }
      if (row.condition && !conditionByName.has(row.condition.toLowerCase())) {
        row.notices.push(`Condition "${row.condition}" is not in the catalog and was left unset`);
      }
    }

    const importable = rows.filter(row => row.errors.length === 0);
    const summary = {
      total: rows.length,
      importable: importable.length,
      rejected: rows.length - importable.length,
      imported: 0,
    };

    if (payload.dryRun) return { summary, rows, committed: false };

    for (const row of importable) {
      const { error } = await supabaseAdmin.rpc('create_manual_sale', {
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
        p_container_size_id: row.size ? sizeByName.get(row.size.toLowerCase()) ?? null : null,
        p_container_condition_id: row.condition ? conditionByName.get(row.condition.toLowerCase()) ?? null : null,
        p_sale_date: row.saleDate ?? null,
        p_sale_number: row.saleNumber ?? null,
        p_invoice_number: row.invoiceNumber ?? null,
        p_container_category_id: row.type ? byCode.get(row.type) ?? null : null,
        p_status: row.status,
      });
      if (error) row.errors.push(error.message);
      else summary.imported += 1;
    }
    summary.rejected = rows.length - summary.imported;

    return { summary, rows, committed: true };
  }

  static async createManualSale(payload: CreateManualSalePayload, userId: string) {
    const { data: sale, error } = await supabaseAdmin
      .rpc('create_manual_sale', {
        p_actor_id: userId,
        p_company_name: payload.companyName,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_pic_id: payload.picId ?? null,
        p_total_units: payload.totalUnits,
        p_buying_cost: payload.buyingCost,
        p_revenue: payload.revenue,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_city: payload.city ?? null,
        p_container_size_id: payload.containerSizeId ?? null,
        p_container_condition_id: payload.containerConditionId ?? null,
        p_sale_date: payload.saleDate ?? null,
        p_sale_number: payload.saleNumber ?? null,
        p_invoice_number: payload.invoiceNumber ?? null,
        p_container_category_id: payload.containerCategoryId ?? null,
        p_status: payload.status ?? 'Won',
      })
      .single();
    if (error) throw new Error(error.code === 'P0001' ? error.message : `Failed to create sale: ${error.message}`);
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
    const { data: sale, error } = await supabaseAdmin
      .rpc('convert_quotation_to_sale', {
        p_quotation_id: quotationId,
        p_actor_id: userId,
        p_total_units: payload.total_units,
        p_buying_cost: payload.buying_cost,
        p_revenue: payload.revenue,
      })
      .single();
    if (error) throw new Error(`Failed to record sale: ${error.message}`);
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
