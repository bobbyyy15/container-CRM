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
  AssignPicToEntrySchema,
  BulkRemovedEntriesSchema,
  ValidateInquiryTicketSchema,
  AddInquiryToWarmLeadsSchema,
  UpdateLeadCellSchema,
} from '../schemas/lead.schema';
import { supabaseAdmin } from '../config/supabase';

const text = (value: unknown) => String(value ?? '').trim().toLowerCase();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

// A record created with no PIC stamped on it is invisible under the pic_id-based data
// silos (NULL never equals NULL for row-ownership checks), so it becomes unreachable the
// moment it's created. Refuse to create it instead of losing it silently.
const requirePicId = (req: Request, res: Response): string | null => {
  const picId = req.auth?.profile.pic_id;
  if (!picId) {
    res.status(400).json({
      success: false,
      error: { message: 'You must be assigned a PIC identity by an admin before creating pipeline records.' },
    });
    return null;
  }
  return picId;
};

let cachedRemoved: {
  companies: Set<string>;
  contacts: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
  timestamp: number;
} | null = null;

export const invalidateRemovedCache = () => {
  cachedRemoved = null;
};

const getCachedRemovedEntries = async () => {
  const now = Date.now();
  if (cachedRemoved && now - cachedRemoved.timestamp < 30_000) {
    return cachedRemoved;
  }
  const { data: removed, error: removedError } = await supabaseAdmin
    .from('removed_entries')
    .select('company_id, contact_id, identity_type, normalized_value');
  if (removedError) throw removedError;

  cachedRemoved = {
    companies: new Set((removed ?? []).map(row => row.company_id).filter(Boolean)),
    contacts: new Set((removed ?? []).map(row => row.contact_id).filter(Boolean)),
    emails: new Set((removed ?? []).filter(row => row.identity_type === 'email').map(row => row.normalized_value)),
    phones: new Set((removed ?? []).filter(row => row.identity_type === 'phone').map(row => row.normalized_value)),
    timestamp: now,
  };
  return cachedRemoved;
};

const listActiveLeads = async (
  table: 'prospect_clients' | 'warm_leads' | 'inquiries',
  req: Request,
) => {
  const query = LeadListQuerySchema.parse(req.query);
  const picId = req.auth?.profile.pic_id;
  if (!picId) {
    return { data: [], meta: { total: 0, limit: query.limit, offset: query.offset } };
  }

  // Two FKs to container_sizes/container_conditions (the ticket's own spec, and the
  // Procurement-suggested alternative) means PostgREST needs the !column disambiguation
  // hint -- an unqualified container_sizes(...) errors with "more than one relationship".
  const select = table === 'inquiries'
    ? '*, companies(*), contacts(*), pics(name), '
      + 'container_sizes!container_size_id(id, name), container_conditions!container_condition_id(id, name), '
      + 'alt_size:container_sizes!alt_container_size_id(id, name), alt_condition:container_conditions!alt_container_condition_id(id, name), '
      + 'backfilled_warm_leads:warm_leads!source_inquiry_id(id)'
    : '*, companies(*), contacts(*), pics(name)';

  const fetchLimit = Math.min(Math.max(query.limit * 2, 500), 1000);
  let dbQuery = supabaseAdmin
    .from(table)
    .select(select)
    .eq('pic_id', picId)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (table === 'prospect_clients' && query.status !== 'all') dbQuery = dbQuery.eq('lifecycle_status', query.status);
  if (table === 'warm_leads' && query.status !== 'all') dbQuery = dbQuery.eq('status', 'active');
  if (table === 'inquiries' && query.status !== 'all') dbQuery = dbQuery.not('status', 'in', '(Removed,Lost,Quotation Created,Converted to Sale)');

  const needsDownstreamFilter = table === 'prospect_clients' && query.status === 'active';
  const applySuppressionFilter = table !== 'prospect_clients' || query.status === 'active';

  const [{ data, error }, removedSet, downstream] = await Promise.all([
    dbQuery,
    applySuppressionFilter ? getCachedRemovedEntries() : Promise.resolve(null),
    needsDownstreamFilter
      ? Promise.all([
          supabaseAdmin.from('warm_leads').select('company_id, contact_id, companies(name), contacts(email_active, email_2, phone_direct, phone_2)').eq('pic_id', picId).eq('status', 'active'),
          supabaseAdmin.from('inquiries').select('company_id, contact_id, companies(name), contacts(email_active, email_2, phone_direct, phone_2)').eq('pic_id', picId).not('status', 'in', '(Removed,Lost)'),
          supabaseAdmin.from('sales').select('company_id, companies(name)').eq('pic_id', picId).eq('status', 'Won'),
        ])
      : Promise.resolve(null),
  ]);
  if (error) throw error;

  const downstreamCompanyIds = new Set<string>();
  const downstreamContactIds = new Set<string>();
  const downstreamCompanyNames = new Set<string>();
  const downstreamEmails = new Set<string>();
  const downstreamPhones = new Set<string>();

  if (downstream) {
    for (const res of downstream) {
      for (const row of (res.data ?? []) as any[]) {
        if (row.company_id) downstreamCompanyIds.add(row.company_id);
        if (row.contact_id) downstreamContactIds.add(row.contact_id);
        if (row.companies?.name) downstreamCompanyNames.add(text(row.companies.name));
        const c = row.contacts;
        if (c) {
          if (c.email_active) downstreamEmails.add(text(c.email_active));
          if (c.email_2) downstreamEmails.add(text(c.email_2));
          if (c.phone_direct) downstreamPhones.add(digits(c.phone_direct));
          if (c.phone_2) downstreamPhones.add(digits(c.phone_2));
        }
      }
    }
  }

  const eligible = (data ?? []).filter((row: any) => {
    const company = row.companies ?? {};
    const contact = row.contacts ?? {};

    // Already a warm lead / inquiry / active client / customer -- it belongs to that stage now.
    if (needsDownstreamFilter) {
      if (row.company_id && downstreamCompanyIds.has(row.company_id)) return false;
      if (row.contact_id && downstreamContactIds.has(row.contact_id)) return false;
      if (company.name && downstreamCompanyNames.has(text(company.name))) return false;
      const emails = [contact.email_active, contact.email_2].map(text).filter(Boolean);
      const phones = [contact.phone_direct, contact.phone_2].map(digits).filter(Boolean);
      if (emails.some((e: string) => downstreamEmails.has(e))) return false;
      if (phones.some((p: string) => downstreamPhones.has(p))) return false;
    }

    if (applySuppressionFilter && removedSet) {
      if (removedSet.companies.has(row.company_id) || removedSet.contacts.has(row.contact_id)) return false;
      if ([contact.email_active, contact.email_2].some(value => removedSet.emails.has(text(value)))) return false;
      if ([contact.phone_direct, contact.phone_2].some(value => removedSet.phones.has(digits(value)))) return false;
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

      // DATA SILOS ENFORCEMENT
      const picId = requirePicId(req, res);
      if (!picId) return;
      payload.picId = picId;

      const prospect = await LeadService.createManualProspect(payload, actorId);
      res.json({ success: true, data: prospect, message: 'Prospect created successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualWarmLead(req: Request, res: Response) {
    try {
      const payload = CreateManualWarmLeadSchema.parse(req.body);
      const actorId = req.auth!.user.id;

      // DATA SILOS ENFORCEMENT
      const picId = requirePicId(req, res);
      if (!picId) return;
      payload.picId = picId;

      const warmLead = await LeadService.createManualWarmLead(payload, actorId);
      res.json({ success: true, data: warmLead, message: 'Warm Lead created successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async createManualInquiry(req: Request, res: Response) {
    try {
      const payload = CreateManualInquirySchema.parse(req.body);
      const actorId = req.auth!.user.id;

      // DATA SILOS ENFORCEMENT
      const picId = requirePicId(req, res);
      if (!picId) return;
      payload.picId = picId;

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

  static async addInquiryToWarmLeads(req: Request, res: Response) {
    try {
      // .parse() would surface the raw ZodError JSON to the caller; every other
      // endpoint returns a single readable message.
      const parsed = AddInquiryToWarmLeadsSchema.safeParse({ inquiryId: req.params.entityId });
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: { message: 'A valid inquiry id is required.' },
        });
      }

      const picId = requirePicId(req, res);
      if (!picId) return;

      const warmLead = await LeadService.addInquiryToWarmLeads(
        parsed.data.inquiryId,
        req.auth!.user.id,
        picId,
      );
      res.status(201).json({
        success: true,
        data: warmLead,
        message: 'Inquiry added to Warm Leads',
      });
    } catch (error: any) {
      // Failing to own the inquiry is an authorization error, not a malformed request:
      // returning 400 made it indistinguishable from a bad payload, and inconsistent
      // with the 403 requireRoles already returns for procurement/operations. Message
      // matching follows the same pattern as inventory.controller.
      const message = String(error?.message ?? 'Failed to add the inquiry to Warm Leads.');
      const status = /not found/i.test(message) ? 404
        : /owned by your own PIC|active Admin or Sales Manager/i.test(message) ? 403
        : 400;
      res.status(status).json({ success: false, error: { message } });
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

  static async bulkRemove(req: Request, res: Response) {
    try {
      const payload = BulkRemovedEntriesSchema.parse(req.body);
      const results = await LeadService.bulkAddRemovedEntries(payload.text, payload.reason, req.auth!.user.id);
      invalidateRemovedCache();
      res.json({ success: true, data: results });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  // GET /leads/client-lookup?identity=<email or phone>
  // Resolves an existing client from a single identity so an inquiry only needs the
  // email or phone plus the order details -- everything else is already on record.
  static async lookupClient(req: Request, res: Response) {
    try {
      const identity = String(req.query.identity ?? '').trim();
      if (!identity) {
        return res.status(400).json({ success: false, error: { message: 'An email or phone number is required.' } });
      }

      const { data, error } = await supabaseAdmin.rpc('lookup_client_by_identity', { p_identity: identity });
      if (error) throw error;

      const match = Array.isArray(data) ? data[0] : data;
      res.json({ success: true, data: match ?? null });
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
        blockCompany: req.body.blockCompany ?? false,
      });
      const removed = await LeadService.removePipelineEntry(
        payload.stage,
        payload.entityId,
        req.auth!.user.id,
        payload.reason,
        payload.blockCompany,
      );
      invalidateRemovedCache();
      res.json({ success: true, data: removed });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async assignPic(req: Request, res: Response) {
    try {
      const payload = AssignPicToEntrySchema.parse({
        stage: req.params.stage,
        entityId: req.params.entityId,
        picId: req.body.picId,
      });
      const actorPicId = requirePicId(req, res);
      if (!actorPicId) return;
      const updated = await LeadService.assignPic(payload.stage, payload.entityId, payload.picId, actorPicId);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  // Procurement's ticket queue is intentionally NOT silo-filtered by pic_id -- validating
  // every Sales Manager's inquiry tickets is the whole point of the role, and this exposes
  // only the inquiry spec (size/condition/quantity/price/location), not revenue or other
  // Sales Manager-private data.
  static async getPendingValidationTickets(req: Request, res: Response) {
    try {
      const data = await LeadService.getPendingValidationTickets();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async getInquiryBoard(req: Request, res: Response) {
    try {
      const data = await LeadService.getInquiryBoard();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async validateTicket(req: Request, res: Response) {
    try {
      const payload = ValidateInquiryTicketSchema.parse(req.body);
      const updated = await LeadService.validateInquiryTicket(
        req.params.entityId as string,
        req.auth!.user.id,
        payload.approved,
        payload.rejectionReason,
        {
          containerSizeId: payload.altContainerSizeId,
          containerConditionId: payload.altContainerConditionId,
          quantity: payload.altQuantity,
          askingPrice: payload.altAskingPrice,
          notes: payload.altNotes,
        },
      );
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async applyAlternative(req: Request, res: Response) {
    try {
      const actorPicId = requirePicId(req, res);
      if (!actorPicId) return;
      const updated = await LeadService.applyInquiryAlternative(req.params.entityId as string, req.auth!.user.id, actorPicId);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateLeadCell(req: Request, res: Response) {
    try {
      const payload = UpdateLeadCellSchema.parse({
        stage: req.params.stage,
        entityId: req.params.entityId,
        field: req.body.field,
        value: req.body.value,
      });

      const isAdmin = req.auth?.profile.role === 'admin' || req.auth?.profile.role === 'operations';
      const picId = req.auth?.profile.pic_id;

      const result = await LeadService.updateLeadCell(
        payload.stage,
        payload.entityId,
        payload.field,
        payload.value,
        req.auth!.user.id,
        picId,
        isAdmin,
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: { message: error.message } });
    }
  }
}
