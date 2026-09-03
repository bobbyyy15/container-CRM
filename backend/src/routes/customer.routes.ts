import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Customer Accounts is in the operations nav (see App.tsx NAV) alongside
// admin/sales_manager, so it needs the same read access here.
router.use(requireRoles('admin', 'sales_manager', 'operations'));

router.get('/', CustomerController.listCustomers);

export default router;
