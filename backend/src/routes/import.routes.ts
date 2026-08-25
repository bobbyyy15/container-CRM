import { Router } from 'express';
import { ImportController } from '../controllers/import.controller';

const router = Router();

router.post('/', ImportController.processImport);
router.get('/conflicts', ImportController.getConflicts);

export default router;
