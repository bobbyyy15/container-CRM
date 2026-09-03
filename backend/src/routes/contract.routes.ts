import { Router } from 'express';
import { ContractController } from '../controllers/contract.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Pickup Tracking and Customer Contracts are both in the operations nav (see App.tsx
// NAV), so operations needs the same access as admin/sales_manager here -- it was
// missing, which 403'd the whole screen and its pickup-status dropdown for that role.
router.use(requireRoles('admin', 'sales_manager', 'operations'));

router.get('/', ContractController.listContracts);
router.post('/', ContractController.createContract);
router.patch('/:id', ContractController.updateContract);

export default router;
