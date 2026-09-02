import { supabaseAdmin } from '../config/supabase';
import {
  UpdateTargetsInput,
  UpdateTerritoriesInput,
  UpsertDailyActivityInput,
} from '../schemas/settings.schema';

export class SettingsService {

  // ── Daily / monthly targets (singleton row) ───────────────────────────────
  static async getTargets() {
    const { data, error } = await supabaseAdmin
      .from('daily_targets')
      .select('*')
      .eq('id', true)
      .single();
    if (error) throw error;
    return data;
  }

  static async updateTargets(payload: UpdateTargetsInput, actorId: string) {
    const { data, error } = await supabaseAdmin
      .from('daily_targets')
      .update({ ...payload, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq('id', true)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  // ── Service territories ───────────────────────────────────────────────────
  static async listTerritories() {
    const { data, error } = await supabaseAdmin
      .from('service_territories')
      .select('*')
      .order('region')
      .order('sort_order');
    if (error) throw error;
    return data ?? [];
  }

  // The screen saves the whole grid at once, so take the enabled flags as a batch
  // rather than making the client fire one request per toggled state.
  static async updateTerritories(payload: UpdateTerritoriesInput) {
    const enabledIds  = payload.territories.filter(t => t.enabled).map(t => t.id);
    const disabledIds = payload.territories.filter(t => !t.enabled).map(t => t.id);

    if (enabledIds.length) {
      const { error } = await supabaseAdmin
        .from('service_territories').update({ enabled: true }).in('id', enabledIds);
      if (error) throw error;
    }
    if (disabledIds.length) {
      const { error } = await supabaseAdmin
        .from('service_territories').update({ enabled: false }).in('id', disabledIds);
      if (error) throw error;
    }
    return this.listTerritories();
  }

  // ── Daily activity (Daily Tasks screen) ───────────────────────────────────
  static async getDailyActivity(picId: string, entryDate: string) {
    const { data, error } = await supabaseAdmin
      .from('daily_activity')
      .select('*')
      .eq('pic_id', picId)
      .eq('entry_date', entryDate)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async listRecentActivity(limit = 30) {
    const { data, error } = await supabaseAdmin
      .from('daily_activity')
      .select('*, pics(name)')
      .order('entry_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  static async upsertDailyActivity(payload: UpsertDailyActivityInput, actorId: string) {
    const { data, error } = await supabaseAdmin.rpc('upsert_daily_activity', {
      p_pic_id:           payload.pic_id,
      p_entry_date:       payload.entry_date,
      p_emails_completed: payload.emails_completed,
      p_email_replies:    payload.email_replies,
      p_emails_bounced:   payload.emails_bounced,
      p_calls_completed:  payload.calls_completed,
      p_calls_answered:   payload.calls_answered,
      p_calls_unanswered: payload.calls_unanswered,
      p_texts_completed:  payload.texts_completed,
      p_text_replies:     payload.text_replies,
      p_texts_opted_out:  payload.texts_opted_out,
      p_notes:            payload.notes ?? null,
      p_actor_id:         actorId,
    });
    if (error) throw error;
    return data;
  }

  // Pipeline results for a PIC on a given day. These are counted from the real
  // pipeline tables rather than typed in on the Daily Tasks form, so they can't
  // drift away from what actually happened in the CRM.
  static async getDerivedResults(picId: string, entryDate: string) {
    const dayStart = `${entryDate}T00:00:00.000Z`;
    const dayEnd   = `${entryDate}T23:59:59.999Z`;

    const countFor = async (table: string) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('pic_id', picId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      if (error) throw error;
      return count ?? 0;
    };

    const [warm_leads, inquiries, quotations, sales] = await Promise.all([
      countFor('warm_leads'),
      countFor('inquiries'),
      countFor('quotations'),
      countFor('sales'),
    ]);

    return { warm_leads, inquiries, quotations, sales };
  }
}
