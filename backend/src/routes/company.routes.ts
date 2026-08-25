import { Router } from 'express';
import { CompanyController } from '../controllers/company.controller';

const router = Router();

router.get('/', CompanyController.getCompanies);
router.post('/', CompanyController.createCompany);
router.get('/:id', CompanyController.getCompany);
router.put('/:id', CompanyController.updateCompany);

export default router;
