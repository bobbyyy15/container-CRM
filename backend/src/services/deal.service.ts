import { supabaseAdmin } from '../config/supabase';

export class DealService {
  
  static async createQuotation(payload: any, userId: string) {
    // 1. Create quotation
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from('quotations')
      .insert({
        inquiry_id: payload.inquiry_id,
        company_id: payload.company_id,
        contact_id: payload.contact_id,
        total_amount: payload.total_amount,
        status: 'Draft'
      })
      .select()
      .single();

    if (quoteErr) throw new Error(`Failed to create quotation: ${quoteErr.message}`);

    // 2. Insert items
    const items = payload.items.map((i: any) => ({
      quotation_id: quote.id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price
    }));

    const { error: itemsErr } = await supabaseAdmin.from('quotation_items').insert(items);
    if (itemsErr) throw new Error(`Failed to insert quotation items: ${itemsErr.message}`);

    // 3. Log event
    await supabaseAdmin.from('domain_events').insert({
      entity_type: 'quotation',
      entity_id: quote.id,
      event_type: 'quotation_created',
      actor_id: userId,
      payload: { amount: payload.total_amount }
    });

    return quote;
  }

  static async convertToSale(quotationId: string, payload: any, userId: string) {
    // 1. Get quotation
    const { data: quote, error: getErr } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();
    
    if (getErr || !quote) throw new Error('Quotation not found');

    // 2. Create Sale
    const gross_profit = payload.revenue - payload.buying_cost;
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from('sales')
      .insert({
        quotation_id: quote.id,
        company_id: quote.company_id,
        status: 'Won',
        total_units: payload.total_units,
        buying_cost: payload.buying_cost,
        revenue: payload.revenue,
        gross_profit
      })
      .select()
      .single();
      
    if (saleErr) throw new Error(`Failed to create sale: ${saleErr.message}`);

    // 3. Update Quotation Status
    await supabaseAdmin
      .from('quotations')
      .update({ status: 'Converted' })
      .eq('id', quotationId);

    // 4. Log event
    await supabaseAdmin.from('domain_events').insert({
      entity_type: 'sale',
      entity_id: sale.id,
      event_type: 'sale_won',
      actor_id: userId,
      payload: { profit: gross_profit }
    });

    return sale;
  }

}
