import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UpsertMasterpaySchema } from '../schemas/deal.schema';
import { MASTERPAY_SALE_SELECT, masterpayColumns, toMasterpayRow } from '../services/masterpay-rows';

const message = (error: any) => error?.issues?.[0]?.message ?? error?.message ?? 'Request failed.';

export class MasterpayController {
  /**
   * Every sale with its payment. Admin and operations see all of them; a sales manager
   * reading through the API sees only their own PIC's, as Sales Tracker does.
   */
  static async list(req: Request, res: Response) {
    try {
      const role = req.auth?.profile.role;
      const picId = req.auth?.profile.pic_id;
      const seesAll = role === 'admin' || role === 'operations';
      if (!seesAll && !picId) return res.json({ success: true, data: [] });

      let query = supabaseAdmin.from('sales').select(MASTERPAY_SALE_SELECT).order('created_at', { ascending: false });
      if (!seesAll) query = query.eq('pic_id', picId!);
      const { data, error } = await query;
      if (error) throw error;

      res.json({ success: true, data: (data ?? []).map(toMasterpayRow) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: message(error) } });
    }
  }

  /**
   * Records the payment against one sale, creating its Masterpay record the first time.
   * The sale is identified by its id, never by company or invoice text, so two accounts
   * with the same company name or a repeated invoice number cannot receive each other's
   * payment.
   */
  static async upsert(req: Request, res: Response) {
    try {
      const saleId = String(req.params.saleId);
      const payload = UpsertMasterpaySchema.parse(req.body);
      const actorId = req.auth!.user.id;

      const { data: sale, error: saleError } = await supabaseAdmin.from('sales').select('id').eq('id', saleId).maybeSingle();
      if (saleError) throw saleError;
      if (!sale) return res.status(404).json({ success: false, error: { message: 'Sale not found.' } });

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('masterpay_records')
        .select('id')
        .eq('sale_id', saleId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      const columns = masterpayColumns(payload);
      const { error: writeError } = existing
        ? await supabaseAdmin.from('masterpay_records').update({ ...columns, updated_by: actorId }).eq('id', existing.id)
        : await supabaseAdmin.from('masterpay_records').insert({ ...columns, sale_id: saleId, created_by: actorId, updated_by: actorId });
      if (writeError) throw writeError;

      const { data: fresh, error: freshError } = await supabaseAdmin
        .from('sales')
        .select(MASTERPAY_SALE_SELECT)
        .eq('id', saleId)
        .single();
      if (freshError) throw freshError;

      res.status(existing ? 200 : 201).json({ success: true, data: toMasterpayRow(fresh) });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: message(error) } });
    }
  }
}
