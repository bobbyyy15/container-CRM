import { Request, Response } from 'express';
import { z } from 'zod';
import { ExportService } from '../services/export.service';

const GoogleSheetExportSchema = z.object({
  title: z.string({ error: 'A sheet title is required.' }).min(1, 'A sheet title is required.').max(200),
  rows:  z.array(z.record(z.string(), z.any()), { error: 'There is nothing to export.' })
          .min(1, 'There is nothing to export.'),
});

export class ExportController {

  // POST /api/v1/export/google-sheet
  static async toGoogleSheet(req: Request, res: Response) {
    try {
      const parsed = GoogleSheetExportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }

      const data = await ExportService.createGoogleSheet(
        req.auth!.user.id,
        parsed.data.title,
        parsed.data.rows,
      );
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message } });
    }
  }
}
