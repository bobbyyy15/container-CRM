import { supabaseAdmin } from '../config/supabase';
import { CreateInquiryPayload } from '../schemas/lead.schema';

export class LeadService {
  static async convertProspectToWarmLead(prospectId: string, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('convert_prospect_to_warm_lead', {
        p_prospect_id: prospectId,
        p_actor_id: actorId,
      })
      .single();

    if (error) throw new Error(`Failed to convert prospect: ${error.message}`);
    return data;
  }

  static async createInquiry(payload: CreateInquiryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_inquiry_from_warm_lead', {
        p_warm_lead_id: payload.warmLeadId,
        p_actor_id: actorId,
        p_container_size_id: payload.containerSizeId,
        p_container_condition_id: payload.containerConditionId,
        p_quantity: payload.quantity,
        p_asking_price: payload.askingPrice ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_needed_by_date: payload.neededByDate ?? null,
        p_requirements: payload.requirements ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create inquiry: ${error.message}`);
    return data;
  }

  static async manualCreateWarmLead(payload: any, actorId: string) {
    const { data, error } = await supabaseAdmin.rpc('manual_create_warm_lead', {
      p_company_name: payload.companyName,
      p_contact_name: payload.contactName ?? null,
      p_email: payload.email ?? null,
      p_phone: payload.phone ?? null,
      p_actor_id: actorId
    }).single();
    if (error) throw new Error(`Failed to manually create warm lead: ${error.message}`);
    return data;
  }

  static async manualCreateInquiry(payload: any, actorId: string) {
    const { data, error } = await supabaseAdmin.rpc('manual_create_inquiry', {
      p_company_name: payload.companyName,
      p_contact_name: payload.contactName ?? null,
      p_email: payload.email ?? null,
      p_phone: payload.phone ?? null,
      p_container_size_id: payload.containerSizeId,
      p_container_condition_id: payload.containerConditionId,
      p_quantity: payload.quantity,
      p_asking_price: payload.askingPrice ?? null,
      p_state_province: payload.stateProvince ?? null,
      p_needed_by_date: payload.neededByDate ?? null,
      p_requirements: payload.requirements ?? null,
      p_actor_id: actorId
    }).single();
    if (error) throw new Error(`Failed to manually create inquiry: ${error.message}`);
    return data;
  }

  static async removePipelineEntry(stage: string, entityId: string, actorId: string, reason: string) {
    const { data, error } = await supabaseAdmin.rpc('remove_pipeline_entry', {
      p_stage: stage,
      p_entity_id: entityId,
      p_actor_id: actorId,
      p_reason: reason,
    });
    if (error) throw new Error(`Failed to remove pipeline entry: ${error.message}`);
    return data;
  }
}
