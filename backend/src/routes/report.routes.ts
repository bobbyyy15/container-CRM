import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';

const router = Router();

// Scoped inside the controller: admins get the org-wide report, everyone else
// gets their own PIC's figures only.
router.get('/monthly', ReportController.monthly);

export default router;
