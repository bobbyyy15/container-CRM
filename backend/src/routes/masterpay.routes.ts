import { Router } from 'express';
import { MasterpayController } from '../controllers/masterpay.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Masterpay is an Operations module. Sales managers may read their own sales' payments
// (Sales Tracker shows the payment date), but only admin and operations record payments.
router.get('/', requireRoles('admin', 'operations', 'sales_manager'), MasterpayController.list);
router.put('/:saleId', requireRoles('admin', 'operations'), MasterpayController.upsert);

export default router;
