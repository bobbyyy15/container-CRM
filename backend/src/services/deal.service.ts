import { supabaseAdmin } from '../config/supabase';
import { ConvertToSalePayload, CreateQuotationPayload } from '../schemas/deal.schema';

export class DealService {
  
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
    return sale;
  }

}
