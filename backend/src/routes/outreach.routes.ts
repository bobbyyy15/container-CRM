import { Router } from 'express';
import { OutreachController } from '../controllers/outreach.controller';

const router = Router();

router.post('/email', OutreachController.sendEmail);

export default router;
