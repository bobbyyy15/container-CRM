import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';
import { DeleteController } from '../controllers/delete.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Quotations
router.get('/quotations', DealController.getQuotations);
router.post('/quotations', requireRoles('admin', 'sales_manager'), DealController.createQuotation);
router.patch('/quotations/:id/status', requireRoles('admin', 'sales_manager'), DealController.updateQuotationStatus);
router.post('/quotations/:id/convert-to-sale', requireRoles('admin', 'sales_manager'), DealController.convertToSale);
router.delete('/quotations/:id', requireRoles('admin', 'sales_manager'), DeleteController.deleteQuotation);

// Sales
router.get('/sales', DealController.getSales);
router.post('/sales', requireRoles('admin', 'sales_manager'), DealController.createManualSale);
router.post('/sales/import', requireRoles('admin', 'sales_manager'), DealController.importSales);
router.patch('/sales/:id/status', requireRoles('admin', 'sales_manager', 'operations'), DealController.updateSaleStatus);
router.patch('/sales/:id', requireRoles('admin', 'sales_manager'), DealController.updateSale);
router.delete('/sales/:id', requireRoles('admin', 'sales_manager'), DealController.deleteSale);

export default router;
