import { Router } from 'express';
import { ImportController } from '../controllers/import.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireRoles('admin', 'sales_manager'), ImportController.processImport);
router.get('/conflicts', requireRoles('admin', 'sales_manager'), ImportController.getConflicts);

export default router;
