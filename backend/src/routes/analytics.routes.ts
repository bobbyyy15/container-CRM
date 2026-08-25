import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();

router.get('/dashboard', AnalyticsController.getDashboardMetrics);

export default router;
