import { Router } from 'express';
import { GoogleAuthController } from '../controllers/google.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/google/status', requireAuth, GoogleAuthController.status);
router.get('/google', requireAuth, GoogleAuthController.getAuthUrl);
// Callback cannot requireAuth because Google redirects here directly without JWT header
router.get('/google/callback', GoogleAuthController.callback);
router.delete('/google', requireAuth, GoogleAuthController.disconnect);

export default router;
