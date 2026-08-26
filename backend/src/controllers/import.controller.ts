import { Request, Response } from 'express';
import { BulkImportPayloadSchema } from '../schemas/import.schema';
import { ImportService } from '../services/import.service';
import { supabaseAdmin } from '../config/supabase';

export class ImportController {
  static async processImport(req: Request, res: Response) {
    try {
      const payload = BulkImportPayloadSchema.parse(req.body);
      
      const results = await ImportService.processBulkImport(
        payload.rows,
        req.auth!.user.id,
        payload.batch_id,
        payload.filename,
      );

      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { message: error.message }
      });
    }
  }

  static async getConflicts(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('import_rows')
        .select('*')
        .in('status', ['conflict', 'error'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
