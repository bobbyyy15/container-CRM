import { supabaseAdmin } from '../config/supabase';
import { ImportRow } from '../schemas/import.schema';

export class ImportService {
  static async processBulkImport(
    rows: ImportRow[],
    actorId: string,
    batchId?: string,
    filename?: string,
  ) {
    const { data, error } = await supabaseAdmin.rpc('process_prospect_import_batch', {
      p_rows: rows,
      p_actor_id: actorId,
      p_batch_id: batchId ?? null,
      p_filename: filename ?? null,
    });

    if (error) {
      throw new Error(`Import transaction failed: ${error.message}`);
    }

    return data;
  }
}
