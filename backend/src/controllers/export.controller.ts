import { Request, Response } from 'express';
import { z } from 'zod';
import { ExportService } from '../services/export.service';

const GoogleSheetExportSchema = z.object({
  title: z.string({ error: 'A sheet title is required.' }).min(1, 'A sheet title is required.').max(200),
  rows:  z.array(z.record(z.string(), z.any()), { error: 'There is nothing to export.' })
          .min(1, 'There is nothing to export.')
          .max(50_000, 'A single export is limited to 50,000 rows. Filter the list first.'),
});

const GoogleWorkbookExportSchema = z.object({
  title: z.string({ error: 'A sheet title is required.' }).min(1, 'A sheet title is required.').max(200),
  tabs:  z.array(z.object({
    name: z.string().min(1),
    rows: z.array(z.record(z.string(), z.any())).max(50_000, 'A single export tab is limited to 50,000 rows.'),
  }), { error: 'There is nothing to export.' }).min(1, 'There is nothing to export.').max(20, 'Maximum 20 tabs per workbook.'),
});

export class ExportController {

  // POST /api/v1/export/google-workbook -- multi-tab, used by the Monthly Report
  static async toGoogleWorkbook(req: Request, res: Response) {
    try {
      const parsed = GoogleWorkbookExportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }

      const data = await ExportService.createGoogleWorkbook(
        req.auth!.user.id,
        parsed.data.title,
        parsed.data.tabs,
      );
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message } });
    }
  }

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
