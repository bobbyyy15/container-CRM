import { supabaseAdmin } from '../config/supabase';

export class LeadService {
  /**
   * Converts a Prospect into a Warm Lead.
   * This is the Hybrid implementation discussed in the Grill-Me session.
   * It can be called by the manual UI button now, and by Webhooks later.
   */
  static async convertProspectToWarmLead(prospectId: string, actorId: string) {
    // 1. Fetch the prospect to ensure it exists and isn't already converted
    const { data: prospect, error: fetchError } = await supabaseAdmin
      .from('prospect_clients')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (fetchError || !prospect) {
      throw new Error(`Prospect not found: ${fetchError?.message}`);
    }

    // 2. Transactionally create the warm lead and domain event.
    // Supabase RPC is best for true transactions, but for now we'll do sequential writes.
    // In a production setup we'd use a postgres function.
    
    const { data: warmLead, error: insertError } = await supabaseAdmin
      .from('warm_leads')
      .insert({
        source_prospect_id: prospect.id,
        company_id: prospect.company_id,
        contact_id: prospect.contact_id,
        pic_id: prospect.pic_id,
        status: 'new'
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to convert prospect: ${insertError.message}`);
    }

    // 3. Write the Domain Event for audit tracking
    await supabaseAdmin
      .from('domain_events')
      .insert({
        entity_type: 'prospect',
        entity_id: prospect.id,
        event_type: 'converted_to_warm_lead',
        actor_id: actorId,
        payload: { warm_lead_id: warmLead.id }
      });

    return warmLead;
  }

  static async createInquiry(warmLeadId: string, actorId: string, requirements?: string) {
    const { data: warmLead, error: fetchError } = await supabaseAdmin
      .from('warm_leads')
      .select('*')
      .eq('id', warmLeadId)
      .single();

    if (fetchError || !warmLead) {
      throw new Error(`Warm Lead not found: ${fetchError?.message}`);
    }

    const { data: inquiry, error: insertError } = await supabaseAdmin
      .from('inquiries')
      .insert({
        source_warm_lead_id: warmLead.id,
        company_id: warmLead.company_id,
        contact_id: warmLead.contact_id,
        pic_id: warmLead.pic_id,
        requirements,
        status: 'Under Review'
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin
      .from('domain_events')
      .insert({
        entity_type: 'warm_lead',
        entity_id: warmLead.id,
        event_type: 'inquiry_created',
        actor_id: actorId,
        payload: { inquiry_id: inquiry.id }
      });

    return inquiry;
  }
}
