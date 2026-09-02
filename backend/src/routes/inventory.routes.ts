import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

const WRITE_ROLES = requireRoles('admin', 'procurement', 'operations');
const ADMIN_ONLY  = requireRoles('admin');

// Read — all authenticated roles
router.get('/',             InventoryController.list);
router.get('/summary',      InventoryController.summary);
router.get('/stock-check',  InventoryController.stockCheck);

// Write — procurement, operations, and admin only
router.post('/',            WRITE_ROLES, InventoryController.create);
router.post('/bulk',        WRITE_ROLES, InventoryController.bulkImport);
router.patch('/:id',        WRITE_ROLES, InventoryController.update);
router.patch('/:id/stock',  WRITE_ROLES, InventoryController.adjustStock);

// Delete — admin only
router.delete('/:id',       ADMIN_ONLY,  InventoryController.remove);

export default router;
