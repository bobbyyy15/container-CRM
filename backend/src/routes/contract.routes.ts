import { Router } from 'express';
import { ContractController } from '../controllers/contract.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Only admin and sales_manager can access contracts
router.use(requireRoles('admin', 'sales_manager'));

router.get('/', ContractController.listContracts);

export default router;
