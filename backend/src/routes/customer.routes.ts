import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Only admin and sales_manager can access customers
router.use(requireRoles('admin', 'sales_manager'));

router.get('/', CustomerController.listCustomers);

export default router;
