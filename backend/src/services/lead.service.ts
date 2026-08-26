import { supabaseAdmin } from '../config/supabase';

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

  static async createInquiry(warmLeadId: string, actorId: string, requirements?: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_inquiry_from_warm_lead', {
        p_warm_lead_id: warmLeadId,
        p_actor_id: actorId,
        p_requirements: requirements ?? null,
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
