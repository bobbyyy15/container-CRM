import { Request, Response } from 'express';
import { LeadService } from '../services/lead.service';
import {
  ConvertProspectSchema,
  CreateInquirySchema,
  CreateManualWarmLeadSchema,
  CreateManualInquirySchema,
  CreateManualProspectSchema,
  LeadListQuerySchema,
  RemovePipelineEntrySchema,
} from '../schemas/lead.schema';
import { supabaseAdmin } from '../config/supabase';

const text = (value: unknown) => String(value ?? '').trim().toLowerCase();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const listActiveLeads = async (
  table: 'prospect_clients' | 'warm_leads' | 'inquiries',
  req: Request,
) => {
  const query = LeadListQuerySchema.parse(req.query);
  const select = table === 'inquiries'
    ? '*, companies(*), contacts(*), pics(name), container_sizes(id, name), container_conditions(id, name)'
    : '*, companies(*), contacts(*), pics(name)';
  let dbQuery = supabaseAdmin
    .from(table)
    .select(select)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (table === 'prospect_clients' && query.status !== 'all') dbQuery = dbQuery.eq('lifecycle_status', query.status);
  if (table === 'warm_leads') dbQuery = dbQuery.eq('status', 'active');
  if (table === 'inquiries') dbQuery = dbQuery.not('status', 'in', '(Removed,Lost,Quotation Created,Converted to Sale)');

  const [{ data, error }, { data: removed, error: removedError }] = await Promise.all([
    dbQuery,
    supabaseAdmin.from('removed_entries').select('company_id, contact_id, identity_type, normalized_value'),
  ]);
  if (error) throw error;
  if (removedError) throw removedError;

  const removedCompanies = new Set((removed ?? []).map(row => row.company_id).filter(Boolean));
  const removedContacts = new Set((removed ?? []).map(row => row.contact_id).filter(Boolean));
  const removedEmails = new Set((removed ?? []).filter(row => row.identity_type === 'email').map(row => row.normalized_value));
  const removedPhones = new Set((removed ?? []).filter(row => row.identity_type === 'phone').map(row => row.normalized_value));

  // Outreach-suppression filtering only makes sense for the "active" working view -- a
  // Converted/Removed/All view on Prospect Clients is meant to show exactly those records,
  // including ones that are also on the removed_entries suppression list.
  const applySuppressionFilter = table !== 'prospect_clients' || query.status === 'active';

  const eligible = (data ?? []).filter((row: any) => {
    const company = row.companies ?? {};
    const contact = row.contacts ?? {};
    if (applySuppressionFilter) {
      if (removedCompanies.has(row.company_id) || removedContacts.has(row.contact_id)) return false;
      if ([contact.email_active, contact.email_2].some(value => removedEmails.has(text(value)))) return false;
      if ([contact.phone_direct, contact.phone_2].some(value => removedPhones.has(digits(value)))) return false;
    }

    const haystack = [company.name, contact.first_name, contact.last_name, contact.email_active, contact.email_2, contact.phone_direct, contact.phone_2]
      .map(text).join(' ');
    if (query.search && !haystack.includes(text(query.search))) return false;
    if (query.country && text(company.address_country) !== text(query.country)) return false;
    if (query.state && text(company.address_state) !== text(query.state)) return false;
    if (query.city && text(company.address_city) !== text(query.city)) return false;
    if (query.industry && text(company.industry) !== text(query.industry)) return false;
    return true;
  });

  return {
    data: eligible.slice(query.offset, query.offset + query.limit),
    meta: { total: eligible.length, limit: query.limit, offset: query.offset },
  };
};

export class LeadController {
  static async getProspects(req: Request, res: Response) {
    try {
      const result = await listActiveLeads('prospect_clients', req);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getWarmLeads(req: Request, res: Response) {
    try {
      const result = await listActiveLeads('warm_leads', req);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getInquiries(req: Request, res: Response) {
    try {
      const result = await listActiveLeads('inquiries', req);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async convertProspect(req: Request, res: Response) {
    try {
      const prospectId = req.params.prospectId as string;
      const payload = ConvertProspectSchema.parse({ ...req.body, prospectId });

      const actorId = req.auth!.user.id;

      const warmLead = await LeadService.convertProspectToWarmLead(prospectId, actorId, payload.reason, payload.channel);

      res.json({
        success: true,
        data: warmLead,
        meta: {}
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { message: error.message }
      });
    }
  }

  static async createManualProspect(req: Request, res: Response) {
    try {
      const payload = CreateManualProspectSchema.parse(req.body);
      const actorId = req.auth!.user.id;
      const prospect = await LeadService.createManualProspect(payload, actorId);
      res.status(201).json({ success: true, data: prospect });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualWarmLead(req: Request, res: Response) {
    try {
      const payload = CreateManualWarmLeadSchema.parse(req.body);
      const actorId = req.auth!.user.id;
      const warmLead = await LeadService.createManualWarmLead(payload, actorId);
      res.status(201).json({ success: true, data: warmLead });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualInquiry(req: Request, res: Response) {
    try {
      const payload = CreateManualInquirySchema.parse(req.body);
      const actorId = req.auth!.user.id;
      const inquiry = await LeadService.createManualInquiry(payload, actorId);
      res.status(201).json({ success: true, data: inquiry });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createInquiry(req: Request, res: Response) {
    try {
      const warmLeadId = req.params.warmLeadId as string;
      const payload = CreateInquirySchema.parse({ ...req.body, warmLeadId });

      const actorId = req.auth!.user.id;

      const inquiry = await LeadService.createInquiry(payload, actorId);

      res.json({
        success: true,
        data: inquiry,
        message: 'Inquiry created successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: { message: error.message }
      });
    }
  }

  static async getRemoved(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('removed_entries')
        .select('*, companies(name), contacts(first_name, last_name, phone_direct, phone_2, email_active, email_2), profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      res.json({ success: true, data, meta: { total: data?.length ?? 0 } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async removeEntry(req: Request, res: Response) {
    try {
      const payload = RemovePipelineEntrySchema.parse({
        stage: req.params.stage,
        entityId: req.params.entityId,
        reason: req.body.reason,
      });
      const removed = await LeadService.removePipelineEntry(
        payload.stage,
        payload.entityId,
        req.auth!.user.id,
        payload.reason,
      );
      res.json({ success: true, data: removed });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
