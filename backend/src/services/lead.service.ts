import { supabaseAdmin } from '../config/supabase';
import { CreateInquiryPayload, CreateManualWarmLeadPayload, CreateManualInquiryPayload, CreateManualProspectPayload } from '../schemas/lead.schema';

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

  static async createManualProspect(payload: CreateManualProspectPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_prospect', {
        p_actor_id: actorId,
        p_company_name: payload.companyName,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_pic_id: payload.picId ?? null,
        p_category: payload.category,
        p_sms_deliverability: payload.smsDeliverability ?? null,
        p_industry: payload.industry ?? null,
        p_service_location: payload.serviceLocation ?? null,
        p_country: payload.country ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_city: payload.city ?? null,
        p_date_added: payload.dateAdded ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create prospect: ${error.message}`);
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

  static async bulkAddRemovedEntries(text: string, reason: string | undefined, actorId: string) {
    const identifiers = text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 1000);
    if (identifiers.length === 0) return [];
    const { data, error } = await supabaseAdmin.rpc('bulk_add_removed_entries', {
      p_identifiers: identifiers,
      p_reason: reason ?? null,
      p_actor_id: actorId,
    });
    if (error) throw new Error(`Failed to process the pasted list: ${error.message}`);
    return data;
  }

  static async assignPic(stage: 'prospect' | 'warm_lead', entityId: string, newPicId: string, actorPicId: string) {
    const table = stage === 'prospect' ? 'prospect_clients' : 'warm_leads';

    const { data: current, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('id, pic_id')
      .eq('id', entityId)
      .maybeSingle();
    if (fetchError) throw new Error(`Failed to look up the record: ${fetchError.message}`);
    if (!current) throw new Error('Record not found.');
    if (current.pic_id !== actorPicId) {
      throw new Error('You can only reassign records currently owned by your own PIC.');
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .update({ pic_id: newPicId })
      .eq('id', entityId)
      .select('id, pic_id')
      .single();
    if (error) throw new Error(`Failed to reassign PIC: ${error.message}`);
    return data;
  }
}
