import { Router } from 'express';
import { PicController } from '../controllers/pic.controller';

const router = Router();

router.get('/', PicController.getPics);

export default router;
