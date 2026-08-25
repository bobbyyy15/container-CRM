import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';

const router = Router();

router.get('/', ContactController.getContacts);
router.post('/', ContactController.createContact);
router.get('/:id', ContactController.getContact);
router.put('/:id', ContactController.updateContact);

export default router;
