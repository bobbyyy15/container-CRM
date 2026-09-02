import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import {
  UpdateTargetsSchema,
  UpdateTerritoriesSchema,
  UpsertDailyActivitySchema,
} from '../schemas/settings.schema';

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, error: { message } });

export class SettingsController {

  // GET /api/v1/settings/targets
  static async getTargets(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await SettingsService.getTargets() });
    } catch (err: any) {
      fail(res, 500, err.message);
    }
  }

  // PATCH /api/v1/settings/targets
  static async updateTargets(req: Request, res: Response) {
    try {
      const parsed = UpdateTargetsSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
      const data = await SettingsService.updateTargets(parsed.data, req.auth!.profile.id);
      res.json({ success: true, data });
    } catch (err: any) {
      fail(res, 400, err.message);
    }
  }

  // GET /api/v1/settings/territories
  static async listTerritories(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await SettingsService.listTerritories() });
    } catch (err: any) {
      fail(res, 500, err.message);
    }
  }

  // PATCH /api/v1/settings/territories
  static async updateTerritories(req: Request, res: Response) {
    try {
      const parsed = UpdateTerritoriesSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
      const data = await SettingsService.updateTerritories(parsed.data);
      res.json({ success: true, data });
    } catch (err: any) {
      fail(res, 400, err.message);
    }
  }

  // GET /api/v1/settings/daily-activity?pic_id=...&entry_date=YYYY-MM-DD
  static async getDailyActivity(req: Request, res: Response) {
    try {
      const picId     = String(req.query.pic_id ?? '');
      const entryDate = String(req.query.entry_date ?? '');
      if (!picId || !entryDate) return fail(res, 400, 'pic_id and entry_date are required');

      const [activity, results] = await Promise.all([
        SettingsService.getDailyActivity(picId, entryDate),
        SettingsService.getDerivedResults(picId, entryDate),
      ]);
      res.json({ success: true, data: { activity, results } });
    } catch (err: any) {
      fail(res, 500, err.message);
    }
  }

  // GET /api/v1/settings/daily-activity/recent
  static async listRecentActivity(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit ?? 30) || 30, 200);
      res.json({ success: true, data: await SettingsService.listRecentActivity(limit) });
    } catch (err: any) {
      fail(res, 500, err.message);
    }
  }

  // POST /api/v1/settings/daily-activity
  static async upsertDailyActivity(req: Request, res: Response) {
    try {
      const parsed = UpsertDailyActivitySchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

      // A sales_manager may only log activity against their own PIC identity;
      // admins record on anyone's behalf.
      const { role, pic_id } = req.auth!.profile;
      if (role !== 'admin' && parsed.data.pic_id !== pic_id) {
        return fail(res, 403, 'You can only record activity for your own PIC identity.');
      }

      const data = await SettingsService.upsertDailyActivity(parsed.data, req.auth!.profile.id);
      res.json({ success: true, data });
    } catch (err: any) {
      fail(res, 400, err.message);
    }
  }
}
