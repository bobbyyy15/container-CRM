import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';

const router = Router();

// Quotations
router.get('/quotations', DealController.getQuotations);
router.post('/quotations', DealController.createQuotation);
router.patch('/quotations/:id/status', DealController.updateQuotationStatus);
router.post('/quotations/:id/convert-to-sale', DealController.convertToSale);

// Sales
router.get('/sales', DealController.getSales);

export default router;
