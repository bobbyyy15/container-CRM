import { Router } from 'express';
import { OutreachController } from '../controllers/outreach.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

router.post('/email', requireRoles('admin', 'manager', 'pic'), OutreachController.sendEmail);

export default router;
