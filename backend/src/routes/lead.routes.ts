import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// GET queries
router.get('/prospects', LeadController.getProspects);
router.get('/warm-leads', LeadController.getWarmLeads);
router.get('/inquiries', LeadController.getInquiries);
router.get('/removed', LeadController.getRemoved);

// Manual Entry
router.post('/warm-leads/manual', requireRoles('admin', 'manager', 'pic'), LeadController.manualCreateWarmLead);
router.post('/inquiries/manual', requireRoles('admin', 'manager', 'pic'), LeadController.manualCreateInquiry);

// Prospect -> Warm Lead
router.post('/prospects/:prospectId/convert-to-warm-lead', requireRoles('admin', 'manager', 'pic'), LeadController.convertProspect);

// Warm Lead -> Inquiry
router.post('/warm-leads/:warmLeadId/create-inquiry', requireRoles('admin', 'manager', 'pic'), LeadController.createInquiry);

router.post('/:stage/:entityId/remove', requireRoles('admin', 'manager', 'pic'), LeadController.removeEntry);

export default router;
