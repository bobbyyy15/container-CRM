import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { requireRoles } from '../middleware/auth.middleware';

const router = Router();

// GET queries
router.get('/prospects', LeadController.getProspects);
router.get('/warm-leads', LeadController.getWarmLeads);
router.get('/inquiries', LeadController.getInquiries);
router.get('/inquiries/pending-validation', requireRoles('admin', 'procurement'), LeadController.getPendingValidationTickets);
router.get('/removed', LeadController.getRemoved);
router.post('/removed/bulk', requireRoles('admin', 'sales_manager'), LeadController.bulkRemove);

// Inquiry ticket validation (Procurement approves/rejects before it's quotable)
router.post('/inquiries/:entityId/validate', requireRoles('admin', 'procurement'), LeadController.validateTicket);

// Prospect -> Warm Lead
router.post('/prospects/:prospectId/convert-to-warm-lead', requireRoles('admin', 'sales_manager'), LeadController.convertProspect);

// Warm Lead -> Inquiry
router.post('/warm-leads/:warmLeadId/create-inquiry', requireRoles('admin', 'sales_manager'), LeadController.createInquiry);

// Manual entry -- no source Prospect/Warm Lead required
router.post('/prospects', requireRoles('admin', 'sales_manager'), LeadController.createManualProspect);
router.post('/warm-leads', requireRoles('admin', 'sales_manager'), LeadController.createManualWarmLead);
router.post('/inquiries', requireRoles('admin', 'sales_manager'), LeadController.createManualInquiry);

router.post('/:stage/:entityId/remove', requireRoles('admin', 'sales_manager'), LeadController.removeEntry);
router.patch('/:stage/:entityId/pic', requireRoles('admin', 'sales_manager'), LeadController.assignPic);

export default router;
