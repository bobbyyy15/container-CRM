import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';

const router = Router();

// GET queries
router.get('/prospects', LeadController.getProspects);
router.get('/warm-leads', LeadController.getWarmLeads);
router.get('/inquiries', LeadController.getInquiries);

// Prospect -> Warm Lead
router.post('/prospects/:prospectId/convert-to-warm-lead', LeadController.convertProspect);

// Warm Lead -> Inquiry
router.post('/warm-leads/:warmLeadId/create-inquiry', LeadController.createInquiry);

export default router;
