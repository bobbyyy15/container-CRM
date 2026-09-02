import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

const ADMIN_ONLY = requireRoles('admin');

// Targets and territories are readable by everyone (dashboards and the Daily Tasks
// form need them to show "X of Y"), but only admins configure them.
router.get('/targets',                SettingsController.getTargets);
router.patch('/targets',   ADMIN_ONLY, SettingsController.updateTargets);

router.get('/territories',            SettingsController.listTerritories);
router.patch('/territories', ADMIN_ONLY, SettingsController.updateTerritories);

// Daily activity — the per-PIC outreach log behind the Daily Tasks screen.
router.get('/daily-activity/recent',  SettingsController.listRecentActivity);
router.get('/daily-activity',         SettingsController.getDailyActivity);
router.post('/daily-activity',        SettingsController.upsertDailyActivity);

export default router;
