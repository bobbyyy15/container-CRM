import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// Every route here is admin-only -- this is account/role management, the most sensitive
// surface in the app.
router.use(requireRoles('admin'));

router.get('/users', AdminController.listUsers);
router.patch('/users/:id', AdminController.updateUser);
router.post('/users/:id/pic', AdminController.assignPic);

export default router;
