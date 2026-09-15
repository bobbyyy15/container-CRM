import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { DeleteController } from '../controllers/delete.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Customer Accounts is in the operations nav (see App.tsx NAV) alongside
// admin/sales_manager, so it needs the same read access here.
router.use(requireRoles('admin', 'sales_manager', 'operations'));

router.get('/', CustomerController.listCustomers);
// The fast lookup for a repurchase.
router.get('/lookup', CustomerController.lookupAccounts);
// A customer account is a rollup of Won sales, so deleting one deletes those
// sales -- operations reads this screen but does not own that data.
router.delete('/:accountId', requireRoles('admin', 'sales_manager'), DeleteController.deleteCustomerAccount);

export default router;
