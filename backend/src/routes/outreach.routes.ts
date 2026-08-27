import { Router } from 'express';
import { OutreachController } from '../controllers/outreach.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

router.post('/email', requireRoles('admin', 'sales_manager'), OutreachController.sendEmail);

export default router;
