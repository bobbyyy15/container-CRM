import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { DealService } from '../services/deal.service';
import { CreateQuotationSchema, UpdateQuotationStatusSchema, ConvertToSaleSchema, CreateManualSaleSchema, UpdateSaleStatusSchema, UpdateSaleSchema, ImportSalesSchema } from '../schemas/deal.schema';

// A record created with no PIC stamped on it is invisible under the pic_id-based data
// silos (NULL never equals NULL for row-ownership checks), so it becomes unreachable the
// moment it's created. Refuse to create it instead of losing it silently.
const requirePicId = (req: Request, res: Response): string | null => {
  const picId = req.auth?.profile.pic_id;
  if (!picId) {
    res.status(400).json({
      success: false,
      error: { message: 'You must be assigned a PIC identity by an admin before creating pipeline records.' },
    });
    return null;
  }
  return picId;
};

/**
 * A ZodError's `message` is the raw issue array, which is what the sale endpoints were
 * answering with when a sale number was in the wrong shape. Read the first issue instead,
 * naming the field, so the dialog can show the sentence as it is.
 */
const readableError = (error: any): string => {
  const issues = error?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return error?.message ?? 'The request could not be processed.';
  const [issue] = issues;
  const field = Array.isArray(issue.path) && issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${field}${issue.message}`;
};

export class DealController {

  static async getQuotations(req: Request, res: Response) {
    try {
      // DATA SILOS ENFORCEMENT -- no PIC assigned (including every admin) means nothing to
      // see; .eq('pic_id', null) is not a valid NULL check in PostgREST and would error.
      const picId = req.auth?.profile.pic_id;
      if (!picId) return res.json({ success: true, data: [] });

      const { data, error } = await supabaseAdmin
        .from('quotations')
        // What was quoted for is recorded on the inquiry, so the quotation list can show
        // size and condition instead of a dash. An inquiry has two of each -- the
        // requirement and the Procurement alternative -- so the embed names the column.
        .select('*, companies(*), contacts(*), pics(name), quotation_items(*), '
          + 'inquiries(container_sizes!container_size_id(name), container_conditions!container_condition_id(name)))')
        .eq('pic_id', picId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getSales(req: Request, res: Response) {
    try {
      const picId = req.auth?.profile.pic_id;
      const seesAllSales = ['admin', 'operations'].includes(req.auth?.profile.role ?? '');
      if (!seesAllSales && !picId) return res.json({ success: true, data: [] });

      let query = supabaseAdmin
        .from('sales')
        // A manually recorded sale has no quotation, so the contact cannot come from
        // quotations(...) alone -- it rendered blank in Sales Tracker even when the
        // company had a contact on file. Embed the company's contacts as a fallback.
        // Size and condition are recorded on a manual sale and live on the inquiry behind
        // the quotation otherwise, so both are embedded and the mapper prefers the sale's own.
        .select('*, companies(*, company_contacts(is_primary, contacts(*))), pics(name), '
          + 'container_sizes(name), container_conditions(name), container_categories(code, name), '
          // An inquiry has two size and two condition FKs -- the requirement and the
          // Procurement-suggested alternative -- so the embed has to name the column.
          + 'quotations(*, contacts(*), quotation_items(*), '
          + 'inquiries(container_sizes!container_size_id(name), container_conditions!container_condition_id(name)))')
        .order('created_at', { ascending: false });
      if (!seesAllSales) query = query.eq('pic_id', picId!);
      const { data, error } = await query;

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async createQuotation(req: Request, res: Response) {
    try {
      const payload = CreateQuotationSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const quote = await DealService.createQuotation(payload, userId);
      res.status(201).json({ success: true, data: quote });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateQuotationStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const payload = UpdateQuotationStatusSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const quote = await DealService.updateQuotationStatus(id, payload, userId);
      res.json({ success: true, data: quote });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualSale(req: Request, res: Response) {
    try {
      const payload = CreateManualSaleSchema.parse(req.body);
      const userId = req.auth!.user.id;

      // DATA SILOS ENFORCEMENT
      const picId = requirePicId(req, res);
      if (!picId) return;
      payload.picId = picId;

      const sale = await DealService.createManualSale(payload, userId);
      res.status(201).json({ success: true, data: sale });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: readableError(error) } });
    }
  }

  /** Edits an existing sale. Financial totals are recalculated, never accepted as given. */
  static async updateSale(req: Request, res: Response) {
    try {
      const payload = UpdateSaleSchema.parse(req.body);
      const sale = await DealService.updateSale(String(req.params.id), payload, {
        role: req.auth?.profile.role,
        picId: req.auth?.profile.pic_id,
      });
      res.json({ success: true, data: sale });
    } catch (error: any) {
      res.status(error.status ?? 400).json({ success: false, error: { message: readableError(error) } });
    }
  }

  /**
   * Imports a sales spreadsheet. Defaults to a dry run: the response describes what would
   * happen to every row, and nothing is written until the caller asks for it explicitly.
   */
  static async importSales(req: Request, res: Response) {
    try {
      const payload = ImportSalesSchema.parse(req.body);
      const picId = requirePicId(req, res);
      if (!picId) return;
      const result = await DealService.importSales(payload, req.auth!.user.id, picId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(error.status ?? 400).json({ success: false, error: { message: readableError(error) } });
    }
  }

  static async convertToSale(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const payload = ConvertToSaleSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const sale = await DealService.convertToSale(id, payload, userId);
      res.status(201).json({ success: true, data: sale });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateSaleStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { status } = UpdateSaleStatusSchema.parse(req.body);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('sales')
        .select('id, pic_id')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Sale not found.' } });
      if (req.auth?.profile.role === 'sales_manager'
        && (!req.auth.profile.pic_id || existing.pic_id !== req.auth.profile.pic_id)) {
        return res.status(403).json({ success: false, error: { message: 'You can only update Sales owned by your own PIC.' } });
      }

      const { data, error } = await supabaseAdmin
        .from('sales')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, companies(*), pics(name)')
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async deleteSale(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('sales')
        .select('id, pic_id')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Sale not found.' } });
      if (req.auth?.profile.role === 'sales_manager'
        && (!req.auth.profile.pic_id || existing.pic_id !== req.auth.profile.pic_id)) {
        return res.status(403).json({ success: false, error: { message: 'You can only delete Sales owned by your own PIC.' } });
      }

      const { count: contractCount, error: contractError } = await supabaseAdmin
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('sale_id', id);
      if (contractError) throw contractError;
      if ((contractCount ?? 0) > 0) {
        return res.status(409).json({
          success: false,
          error: { message: 'This Sale has a Contract and cannot be deleted.' },
        });
      }

      const { error } = await supabaseAdmin
        .from('sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true, message: 'Sale deleted successfully.' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
