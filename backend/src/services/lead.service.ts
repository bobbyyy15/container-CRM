import { supabaseAdmin } from '../config/supabase';
import { CreateInquiryPayload, CreateManualWarmLeadPayload, CreateManualInquiryPayload } from '../schemas/lead.schema';

export class LeadService {
  static async convertProspectToWarmLead(prospectId: string, actorId: string, reason?: string, channel?: string) {
    const { data, error } = await supabaseAdmin
      .rpc('convert_prospect_to_warm_lead', {
        p_prospect_id: prospectId,
        p_actor_id: actorId,
        p_reason: reason ?? null,
        p_channel: channel ?? null,
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
        p_needed_by_date: payload.neededByDate ?? null,
        p_requirements: payload.requirements ?? null,
        p_asking_price: payload.askingPrice ?? null,
        p_special_requirements: payload.specialRequirements ?? null,
        p_remarks: payload.remarks ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create inquiry: ${error.message}`);
    return data;
  }

  static async createManualWarmLead(payload: CreateManualWarmLeadPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_warm_lead', {
        p_actor_id: actorId,
        p_company_name: payload.companyName,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_pic_id: payload.picId ?? null,
        p_notes: payload.notes ?? null,
        p_previous_inquiry_indicator: payload.previousInquiryIndicator ?? false,
        p_source: payload.source ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_follow_up_notes: payload.followUpNotes ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create warm lead: ${error.message}`);
    return data;
  }

  static async createManualInquiry(payload: CreateManualInquiryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_inquiry', {
        p_actor_id: actorId,
        p_warm_lead_id: payload.warmLeadId ?? null,
        p_company_name: payload.companyName ?? null,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_pic_id: payload.picId ?? null,
        p_container_size_id: payload.containerSizeId,
        p_container_condition_id: payload.containerConditionId,
        p_quantity: payload.quantity,
        p_asking_price: payload.askingPrice ?? null,
        p_requirements: payload.requirements ?? null,
        p_special_requirements: payload.specialRequirements ?? null,
        p_remarks: payload.remarks ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_needed_by_date: payload.neededByDate ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create inquiry: ${error.message}`);
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
