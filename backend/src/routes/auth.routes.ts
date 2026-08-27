import { Router } from 'express';
import { GoogleAuthController } from '../controllers/google.controller';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// No auth required: this runs before the user has a session, to resolve a username login
// into the email Supabase Auth actually signs in with.
router.post('/resolve-login', AuthController.resolveLogin);

router.get('/me', requireAuth, AuthController.me);

router.get('/google/status', requireAuth, GoogleAuthController.status);
router.post('/google/sync-provider', requireAuth, GoogleAuthController.syncProvider);
router.get('/google', requireAuth, GoogleAuthController.getAuthUrl);
// Callback cannot requireAuth because Google redirects here directly without JWT header
router.get('/google/callback', GoogleAuthController.callback);
router.delete('/google', requireAuth, GoogleAuthController.disconnect);

export default router;
