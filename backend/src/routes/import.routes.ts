import { Router } from 'express';
import { ImportController } from '../controllers/import.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireRoles('admin', 'manager'), ImportController.processImport);
router.get('/conflicts', ImportController.getConflicts);

export default router;
