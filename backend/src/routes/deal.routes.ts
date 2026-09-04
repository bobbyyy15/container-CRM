import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Quotations
router.get('/quotations', DealController.getQuotations);
router.post('/quotations', requireRoles('admin', 'sales_manager'), DealController.createQuotation);
router.patch('/quotations/:id/status', requireRoles('admin', 'sales_manager'), DealController.updateQuotationStatus);
router.post('/quotations/:id/convert-to-sale', requireRoles('admin', 'sales_manager'), DealController.convertToSale);

// Sales
router.get('/sales', DealController.getSales);
router.post('/sales', requireRoles('admin', 'sales_manager'), DealController.createManualSale);
router.patch('/sales/:id/status', requireRoles('admin', 'sales_manager', 'operations'), DealController.updateSaleStatus);
router.delete('/sales/:id', requireRoles('admin', 'sales_manager'), DealController.deleteSale);

export default router;

