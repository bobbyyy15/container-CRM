import { Router } from 'express';
import { ExportController } from '../controllers/export.controller';

const router = Router();

// Exports carry whatever rows the caller can already see on screen, so no extra
// role gate here -- the underlying lists are already scoped by RLS and role.
router.post('/google-sheet', ExportController.toGoogleSheet);

export default router;
