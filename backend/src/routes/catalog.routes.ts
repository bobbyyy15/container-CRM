import { Router } from 'express';
import { CatalogController } from '../controllers/catalog.controller';

const router = Router();

router.get('/sizes', CatalogController.getSizes);
router.get('/conditions', CatalogController.getConditions);

export default router;
