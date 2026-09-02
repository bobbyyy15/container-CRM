import { Router } from 'express';
import { CatalogController } from '../controllers/catalog.controller';

const router = Router();

router.get('/sizes', CatalogController.getSizes);
router.get('/conditions', CatalogController.getConditions);
router.get('/categories', CatalogController.getCategories);

export default router;
