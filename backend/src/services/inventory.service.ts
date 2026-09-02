import { supabaseAdmin } from '../config/supabase';
import {
  CreateInventoryPayload,
  UpdateInventoryPayload,
  AdjustStockPayload,
  BulkInventoryPayload,
} from '../schemas/inventory.schema';

export class InventoryService {

  // ── List with filters ─────────────────────────────────────────────────────
  static async listInventory(filters: {
    search?:              string;
    container_size?:      string;
    container_condition?: string;
    depot_name?:          string;
    vendor_supplier?:     string;
    status?:              string;
    limit?:               number;
  }) {
    let q = supabaseAdmin
      .from('inventory')
      .select('*, profiles!created_by(username, full_name)')
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? 1000);

    if (filters.search) {
      q = q.or(
        `container_size.ilike.%${filters.search}%,` +
        `container_condition.ilike.%${filters.search}%,` +
        `depot_name.ilike.%${filters.search}%,` +
        `vendor_supplier.ilike.%${filters.search}%`
      );
    }
    if (filters.container_size      && filters.container_size !== 'All Sizes')
      q = q.eq('container_size', filters.container_size);
    if (filters.container_condition && filters.container_condition !== 'All Conditions')
      q = q.eq('container_condition', filters.container_condition);
    if (filters.depot_name          && filters.depot_name !== 'All Depots')
      q = q.eq('depot_name', filters.depot_name);
    if (filters.vendor_supplier     && filters.vendor_supplier !== 'All Vendors')
      q = q.eq('vendor_supplier', filters.vendor_supplier);
    if (filters.status              && filters.status !== 'All Statuses')
      q = q.eq('status', filters.status);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to load inventory: ${error.message}`);
    return data ?? [];
  }

  // ── Aggregated KPI summary ────────────────────────────────────────────────
  static async getSummary() {
    const { data, error } = await supabaseAdmin
      .from('inventory_summary')
      .select('*')
      .single();
    if (error) throw new Error(`Failed to load inventory summary: ${error.message}`);
    return data;
  }

  // ── Stock availability lookup for a specific spec ─────────────────────────
  // Used by Procurement's InquiryValidation cross-check widget.
  static async getStockForSpec(containerSize: string, containerCondition: string) {
    const { data, error } = await supabaseAdmin.rpc('get_stock_for_spec', {
      p_container_size:      containerSize,
      p_container_condition: containerCondition,
    });
    if (error) throw new Error(`Failed to look up stock: ${error.message}`);
    return data;
  }

  // ── Create single record ──────────────────────────────────────────────────
  static async createInventory(payload: CreateInventoryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .from('inventory')
      .insert({ ...payload, created_by: actorId, updated_by: actorId })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create inventory record: ${error.message}`);
    return data;
  }

  // ── Update (ownership-checked for non-admin) ──────────────────────────────
  static async updateInventory(
    id: string,
    payload: UpdateInventoryPayload,
    actorId: string,
    actorRole: string,
  ) {
    if (actorRole !== 'admin') {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('inventory')
        .select('created_by')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw new Error(`Failed to look up record: ${fetchErr.message}`);
      if (!existing) throw new Error('Inventory record not found.');
      if (existing.created_by !== actorId)
        throw new Error('You can only edit inventory records you created.');
    }

    const { data, error } = await supabaseAdmin
      .from('inventory')
      .update({ ...payload, updated_by: actorId })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to update inventory record: ${error.message}`);
    return data;
  }

  // ── Quick inline +/- stock adjustment ────────────────────────────────────
  static async adjustStock(
    id: string,
    payload: AdjustStockPayload,
    actorId: string,
    actorRole: string,
  ) {
    // Fetch current counts first
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('inventory')
      .select('quantity_available, quantity_reserved, created_by')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw new Error(`Failed to look up record: ${fetchErr.message}`);
    if (!current) throw new Error('Inventory record not found.');

    if (actorRole !== 'admin' && current.created_by !== actorId)
      throw new Error('You can only adjust stock for inventory records you created.');

    const newAvailable = Math.max(0, current.quantity_available + (payload.delta_available ?? 0));
    const newReserved  = Math.max(0, current.quantity_reserved  + (payload.delta_reserved  ?? 0));

    const { data, error } = await supabaseAdmin
      .from('inventory')
      .update({ quantity_available: newAvailable, quantity_reserved: newReserved, updated_by: actorId })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to adjust stock: ${error.message}`);
    return data;
  }

  // ── Bulk import via RPC ───────────────────────────────────────────────────
  static async bulkImport(payload: BulkInventoryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin.rpc('bulk_insert_inventory', {
      p_actor_id: actorId,
      p_rows:     payload.rows,
    });
    if (error) throw new Error(`Bulk import failed: ${error.message}`);
    return data;
  }

  // ── Delete (admin only — enforced by RLS, double-checked here) ────────────
  static async deleteInventory(id: string, actorRole: string) {
    if (actorRole !== 'admin')
      throw new Error('Only admins can delete inventory records.');

    const { error } = await supabaseAdmin
      .from('inventory')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete inventory record: ${error.message}`);
  }
}
