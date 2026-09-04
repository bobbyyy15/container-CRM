import { supabaseAdmin } from '../config/supabase';
import { CreateInquiryPayload, CreateManualWarmLeadPayload, CreateManualInquiryPayload, CreateManualProspectPayload } from '../schemas/lead.schema';

export class LeadService {
  static async convertProspectToWarmLead(prospectId: string, actorId: string, reason?: string, channel?: string) {
    const { data, error } = await supabaseAdmin
      .rpc('convert_prospect_to_warm_lead', {
        p_prospect_id: prospectId,
        p_actor_id: actorId,
        p_reason: reason ?? null,
        p_channel: channel ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to convert prospect: ${error.message}`);
    return data;
  }

  static async createInquiry(payload: CreateInquiryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_inquiry_from_warm_lead', {
        p_warm_lead_id: payload.warmLeadId,
        p_actor_id: actorId,
        p_container_size_id: payload.containerSizeId,
        p_container_condition_id: payload.containerConditionId,
        p_quantity: payload.quantity,
        p_needed_by_date: payload.neededByDate ?? null,
        p_requirements: payload.requirements ?? null,
        p_asking_price: payload.askingPrice ?? null,
        p_special_requirements: payload.specialRequirements ?? null,
        p_remarks: payload.remarks ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create inquiry: ${error.message}`);
    if (data?.company_id) {
      await supabaseAdmin
        .from('prospect_clients')
        .update({ lifecycle_status: 'converted', converted_at: new Date().toISOString() })
        .eq('company_id', data.company_id)
        .eq('lifecycle_status', 'active');
    }
    return data;
  }

  static async createManualProspect(payload: CreateManualProspectPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_prospect', {
        p_actor_id: actorId,
        p_company_name: payload.companyName,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_pic_id: payload.picId ?? null,
        p_category: payload.category,
        p_sms_deliverability: payload.smsDeliverability ?? null,
        p_industry: payload.industry ?? null,
        p_service_location: payload.serviceLocation ?? null,
        p_country: payload.country ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_city: payload.city ?? null,
        p_date_added: payload.dateAdded ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create prospect: ${error.message}`);
    return data;
  }

  static async createManualWarmLead(payload: CreateManualWarmLeadPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_warm_lead', {
        p_actor_id: actorId,
        p_company_name: payload.companyName,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_pic_id: payload.picId ?? null,
        p_notes: payload.notes ?? null,
        p_previous_inquiry_indicator: payload.previousInquiryIndicator ?? false,
        p_source: payload.source ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_follow_up_notes: payload.followUpNotes ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create warm lead: ${error.message}`);
    if (data?.company_id) {
      await supabaseAdmin
        .from('prospect_clients')
        .update({ lifecycle_status: 'converted', converted_at: new Date().toISOString() })
        .eq('company_id', data.company_id)
        .eq('lifecycle_status', 'active');
    }
    return data;
  }

  static async createManualInquiry(payload: CreateManualInquiryPayload, actorId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('create_manual_inquiry', {
        p_actor_id: actorId,
        p_warm_lead_id: payload.warmLeadId ?? null,
        p_company_name: payload.companyName ?? null,
        p_contact_person: payload.contactPerson ?? null,
        p_phone: payload.phone ?? null,
        p_email: payload.email ?? null,
        p_state_province: payload.stateProvince ?? null,
        p_country: payload.country ?? null,
        p_pic_id: payload.picId ?? null,
        p_container_size_id: payload.containerSizeId,
        p_container_condition_id: payload.containerConditionId,
        p_quantity: payload.quantity,
        p_asking_price: payload.askingPrice ?? null,
        p_requirements: payload.requirements ?? null,
        p_special_requirements: payload.specialRequirements ?? null,
        p_remarks: payload.remarks ?? null,
        p_follow_up_date: payload.followUpDate ?? null,
        p_needed_by_date: payload.neededByDate ?? null,
      })
      .single();

    if (error) throw new Error(`Failed to create inquiry: ${error.message}`);
    if (data?.company_id) {
      await supabaseAdmin
        .from('prospect_clients')
        .update({ lifecycle_status: 'converted', converted_at: new Date().toISOString() })
        .eq('company_id', data.company_id)
        .eq('lifecycle_status', 'active');
    }
    return data;
  }

  static async addInquiryToWarmLeads(inquiryId: string, actorId: string, actorPicId: string) {
    const { data: inquiry, error: fetchError } = await supabaseAdmin
      .from('inquiries')
      .select('id, pic_id')
      .eq('id', inquiryId)
      .maybeSingle();
    if (fetchError) throw new Error(`Failed to look up the inquiry: ${fetchError.message}`);
    if (!inquiry) throw new Error('Inquiry not found.');
    if (inquiry.pic_id !== actorPicId) {
      throw new Error('You can only add inquiries owned by your own PIC to Warm Leads.');
    }

    const { data, error } = await supabaseAdmin
      .rpc('create_warm_lead_from_inquiry', {
        p_inquiry_id: inquiryId,
        p_actor_id: actorId,
      })
      .single();
    if (error) throw new Error(`Failed to add inquiry to Warm Leads: ${error.message}`);
    return data;
  }

  static async insertRemovedEntrySafe(entry: {
    company_id?: string | null;
    contact_id?: string | null;
    identity_type: string;
    normalized_value?: string | null;
    reason: string;
    source: string;
    created_by?: string | null;
  }) {
    try {
      if (entry.normalized_value) {
        const { data: existing } = await supabaseAdmin
          .from('removed_entries')
          .select('id')
          .eq('identity_type', entry.identity_type)
          .eq('normalized_value', entry.normalized_value)
          .maybeSingle();

        if (existing?.id) {
          await supabaseAdmin
            .from('removed_entries')
            .update({
              company_id: entry.company_id ?? undefined,
              contact_id: entry.contact_id ?? undefined,
              reason: entry.reason,
              source: entry.source,
            })
            .eq('id', existing.id);
          return;
        }
      } else if (entry.company_id && entry.contact_id) {
        const { data: existing } = await supabaseAdmin
          .from('removed_entries')
          .select('id')
          .eq('company_id', entry.company_id)
          .eq('contact_id', entry.contact_id)
          .maybeSingle();

        if (existing?.id) {
          await supabaseAdmin
            .from('removed_entries')
            .update({
              reason: entry.reason,
              source: entry.source,
            })
            .eq('id', existing.id);
          return;
        }
      }

      await supabaseAdmin.from('removed_entries').insert(entry);
    } catch (err) {
      console.error('insertRemovedEntrySafe error:', err);
    }
  }

  static async cascadeCompanyBlock(companyId: string, reason: string, actorId: string, source = 'deliverability') {
    if (!companyId) return;

    // 1. Insert parent company suppression row
    await this.insertRemovedEntrySafe({
      company_id: companyId,
      contact_id: null,
      identity_type: 'company',
      normalized_value: companyId,
      reason: reason || 'Bulk paste (Company Block)',
      source,
      created_by: actorId,
    });

    // 2. Query all distinct contacts associated with this company
    const contactIds = new Set<string>();
    const [ccRes, pcRes, wlRes, inqRes, sRes] = await Promise.all([
      supabaseAdmin.from('company_contacts').select('contact_id').eq('company_id', companyId),
      supabaseAdmin.from('prospect_clients').select('contact_id').eq('company_id', companyId).not('contact_id', 'is', null),
      supabaseAdmin.from('warm_leads').select('contact_id').eq('company_id', companyId).not('contact_id', 'is', null),
      supabaseAdmin.from('inquiries').select('contact_id').eq('company_id', companyId).not('contact_id', 'is', null),
      supabaseAdmin.from('sales').select('contact_id').eq('company_id', companyId).not('contact_id', 'is', null),
    ]);

    for (const r of (ccRes.data ?? [])) if (r.contact_id) contactIds.add(r.contact_id);
    for (const r of (pcRes.data ?? [])) if (r.contact_id) contactIds.add(r.contact_id);
    for (const r of (wlRes.data ?? [])) if (r.contact_id) contactIds.add(r.contact_id);
    for (const r of (inqRes.data ?? [])) if (r.contact_id) contactIds.add(r.contact_id);
    for (const r of (sRes.data ?? [])) if (r.contact_id) contactIds.add(r.contact_id);

    if (contactIds.size > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('id, first_name, last_name, email_active, email_2, phone_direct, phone_2')
        .in('id', Array.from(contactIds));

      for (const c of (contacts ?? [])) {
        // Clean up any individual email/phone suppression rows for this contact
        await supabaseAdmin
          .from('removed_entries')
          .delete()
          .eq('contact_id', c.id)
          .in('identity_type', ['phone', 'email']);

        // Insert exactly one Company Block row for this contact
        await this.insertRemovedEntrySafe({
          company_id: companyId,
          contact_id: c.id,
          identity_type: 'company',
          normalized_value: c.id,
          reason: reason || 'Bulk paste (Company Block)',
          source,
          created_by: actorId,
        });
      }
    }

    // 3. Cascade pipeline records across the company
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from('prospect_clients').update({ lifecycle_status: 'removed', removed_at: nowIso }).eq('company_id', companyId).neq('lifecycle_status', 'removed'),
      supabaseAdmin.from('warm_leads').update({ status: 'removed', removed_at: nowIso }).eq('company_id', companyId).neq('status', 'removed'),
      supabaseAdmin.from('inquiries').update({ status: 'Removed' }).eq('company_id', companyId).not('status', 'in', '("Removed","Won","Converted to Sale")'),
      supabaseAdmin.from('quotations').update({ status: 'Rejected' }).eq('company_id', companyId).not('status', 'in', '("Converted","Rejected")'),
    ]);
  }

  static async removePipelineEntry(stage: string, entityId: string, actorId: string, reason: string, blockCompany = false) {
    let removedData: any = null;
    let rpcError: any = null;

    try {
      const res = await supabaseAdmin.rpc('remove_pipeline_entry', {
        p_stage: stage,
        p_entity_id: entityId,
        p_actor_id: actorId,
        p_reason: reason,
        p_block_company: blockCompany,
      });
      if (!res.error) removedData = res.data;
      else rpcError = res.error;
    } catch (e: any) {
      rpcError = e;
    }

    if (rpcError) {
      // Graceful fallback to 4-param RPC
      const { data, error } = await supabaseAdmin.rpc('remove_pipeline_entry', {
        p_stage: stage,
        p_entity_id: entityId,
        p_actor_id: actorId,
        p_reason: reason,
      });
      if (error) throw new Error(`Failed to remove pipeline entry: ${error.message}`);
      removedData = data;
    }

    if (blockCompany && removedData?.company_id) {
      await this.cascadeCompanyBlock(removedData.company_id, reason, actorId, stage);
    }

    return removedData;
  }

  static async bulkAddRemovedEntries(text: string, reason: string | undefined, actorId: string, blockCompany: boolean = false) {
    const identifiers = text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 1000);
    if (identifiers.length === 0) return [];

    let data: any[] | null = null;
    let rpcSuccess = false;

    // 1. Try modern 4-arg RPC
    try {
      const res = await supabaseAdmin.rpc('bulk_add_removed_entries', {
        p_identifiers: identifiers,
        p_reason: reason ?? null,
        p_actor_id: actorId,
        p_block_company: blockCompany,
      });
      if (!res.error) {
        data = res.data;
        rpcSuccess = true;
      }
    } catch (_) {}

    // 2. If 4-arg failed or wasn't found in schema cache, try 3-arg RPC
    if (!rpcSuccess) {
      try {
        const res = await supabaseAdmin.rpc('bulk_add_removed_entries', {
          p_identifiers: identifiers,
          p_reason: reason ?? null,
          p_actor_id: actorId,
        });
        if (!res.error) {
          data = res.data;
          rpcSuccess = true;
        }
      } catch (_) {}
    }

    // 3. If blockCompany is requested, resolve company for each identifier and cascade
    if (blockCompany) {
      const companyIds = new Set<string>();

      // Check companies from rpc output
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.company_name) {
            const { data: comps } = await supabaseAdmin.from('companies').select('id').ilike('name', row.company_name).limit(1);
            if (comps?.[0]?.id) companyIds.add(comps[0].id);
          }
        }
      }

      // Check companies directly from identifiers
      for (const idf of identifiers) {
        try {
          const { data: lookup } = await supabaseAdmin.rpc('lookup_client_by_identity', { p_identity: idf });
          const match = Array.isArray(lookup) ? lookup[0] : lookup;
          if (match?.company_id) {
            companyIds.add(match.company_id);
          }
        } catch (_) {}

        // Contacts email search
        if (idf.includes('@')) {
          const { data: conts } = await supabaseAdmin
            .from('contacts')
            .select('id, company_contacts(company_id)')
            .or(`email_active.ilike.${idf},email_2.ilike.${idf},email_active_normalized.eq.${idf.toLowerCase()}`);
          for (const c of (conts ?? [])) {
            for (const cc of ((c as any).company_contacts ?? [])) if (cc.company_id) companyIds.add(cc.company_id);
          }
        } else {
          // Phone digits search
          const digits = idf.replace(/\D/g, '');
          if (digits.length >= 7) {
            const { data: conts } = await supabaseAdmin
              .from('contacts')
              .select('id, company_contacts(company_id)')
              .or(`phone_direct.ilike.%${digits}%,phone_2.ilike.%${digits}%,phone_direct_normalized.ilike.%${digits}%`);
            for (const c of (conts ?? [])) {
              for (const cc of ((c as any).company_contacts ?? [])) if (cc.company_id) companyIds.add(cc.company_id);
            }
          }
        }

        // Direct company name match
        const { data: comps } = await supabaseAdmin.from('companies').select('id').ilike('name', `%${idf}%`).limit(5);
        for (const c of (comps ?? [])) if (c.id) companyIds.add(c.id);
      }

      for (const compId of companyIds) {
        await this.cascadeCompanyBlock(compId, reason || 'Bulk paste (Company Block)', actorId, 'deliverability');
      }
    }

    if (!data) {
      data = identifiers.map(raw => ({
        raw_value: raw,
        identity_type: blockCompany ? 'company' : (raw.includes('@') ? 'email' : 'phone'),
        normalized_value: raw,
        company_name: null,
        contact_name: null,
        was_new: true,
      }));
    }

    return data;
  }

  static async restoreRemovedEntry(removedId: string, actorId: string) {
    try {
      const { data, error } = await supabaseAdmin.rpc('restore_removed_entry', {
        p_removed_id: removedId,
        p_actor_id: actorId,
      });
      if (!error) return data;
    } catch (_) {}

    // Direct fallback
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('removed_entries')
      .select('*')
      .eq('id', removedId)
      .maybeSingle();
    if (fetchErr || !row) throw new Error('Removed entry not found.');

    const companyId = row.company_id;
    const contactId = row.contact_id;
    const isCompany = row.identity_type === 'company' && companyId && !contactId;

    if (isCompany) {
      // Restoring a pure company-level entry: unblock all suppression entries for this company
      await supabaseAdmin.from('removed_entries').delete().eq('company_id', companyId);
      await Promise.all([
        supabaseAdmin.from('prospect_clients').update({ lifecycle_status: 'active', removed_at: null }).eq('company_id', companyId).eq('lifecycle_status', 'removed'),
        supabaseAdmin.from('warm_leads').update({ status: 'active', removed_at: null }).eq('company_id', companyId).eq('status', 'removed'),
        supabaseAdmin.from('inquiries').update({ status: 'New' }).eq('company_id', companyId).eq('status', 'Removed'),
      ]);
    } else if (contactId) {
      // Restoring a specific contact: unblock this contact's suppression entries
      await supabaseAdmin.from('removed_entries').delete().eq('contact_id', contactId);
      await supabaseAdmin.from('removed_entries').delete().eq('id', removedId);
      if (row.normalized_value) {
        await supabaseAdmin.from('removed_entries').delete().eq('normalized_value', row.normalized_value);
      }
      if (companyId) {
        await supabaseAdmin.from('removed_entries').delete().eq('company_id', companyId).is('contact_id', null);
      }
      await Promise.all([
        supabaseAdmin.from('prospect_clients').update({ lifecycle_status: 'active', removed_at: null }).eq('contact_id', contactId).eq('lifecycle_status', 'removed'),
        supabaseAdmin.from('warm_leads').update({ status: 'active', removed_at: null }).eq('contact_id', contactId).eq('status', 'removed'),
        supabaseAdmin.from('inquiries').update({ status: 'New' }).eq('contact_id', contactId).eq('status', 'Removed'),
      ]);
    } else if (companyId) {
      await supabaseAdmin.from('removed_entries').delete().eq('company_id', companyId);
      await Promise.all([
        supabaseAdmin.from('prospect_clients').update({ lifecycle_status: 'active', removed_at: null }).eq('company_id', companyId).eq('lifecycle_status', 'removed'),
        supabaseAdmin.from('warm_leads').update({ status: 'active', removed_at: null }).eq('company_id', companyId).eq('status', 'removed'),
        supabaseAdmin.from('inquiries').update({ status: 'New' }).eq('company_id', companyId).eq('status', 'Removed'),
      ]);
    } else {
      await supabaseAdmin.from('removed_entries').delete().eq('id', removedId);
      if (row.normalized_value) {
        await supabaseAdmin.from('removed_entries').delete().eq('normalized_value', row.normalized_value);
      }
    }

    return { success: true };
  }

  static async assignPic(stage: 'prospect' | 'warm_lead', entityId: string, newPicId: string, actorPicId: string) {
    const table = stage === 'prospect' ? 'prospect_clients' : 'warm_leads';

    const { data: current, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('id, pic_id')
      .eq('id', entityId)
      .maybeSingle();
    if (fetchError) throw new Error(`Failed to look up the record: ${fetchError.message}`);
    if (!current) throw new Error('Record not found.');
    if (current.pic_id !== actorPicId) {
      throw new Error('You can only reassign records currently owned by your own PIC.');
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .update({ pic_id: newPicId })
      .eq('id', entityId)
      .select('id, pic_id')
      .single();
    if (error) throw new Error(`Failed to reassign PIC: ${error.message}`);
    return data;
  }

  static async getPendingValidationTickets() {
    const { data, error } = await supabaseAdmin
      .from('inquiries')
      // Disambiguate: inquiries now has two FKs to container_sizes/container_conditions
      // (the ticket's own spec, and the Procurement-suggested alternative on rejection).
      .select('*, companies(*), contacts(*), pics(name), container_sizes!container_size_id(id, name), container_conditions!container_condition_id(id, name)')
      .eq('status', 'Pending Validation')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to load the validation queue: ${error.message}`);
    return data;
  }

  // The full ticket board (every status, every PIC) -- Procurement needs to see where every
  // ticket stands, not just the ones still awaiting their own action. Deliberately not
  // silo-filtered by pic_id, same reasoning as the pending-validation queue above.
  static async getInquiryBoard() {
    const { data, error } = await supabaseAdmin
      .from('inquiries')
      .select('*, companies(*), contacts(*), pics(name), container_sizes!container_size_id(id, name), container_conditions!container_condition_id(id, name), alt_size:container_sizes!alt_container_size_id(id, name), alt_condition:container_conditions!alt_container_condition_id(id, name)')
      .not('status', 'eq', 'Removed')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw new Error(`Failed to load the ticket board: ${error.message}`);
    return data;
  }

  static async validateInquiryTicket(
    inquiryId: string,
    actorId: string,
    approved: boolean,
    rejectionReason: string | undefined,
    alt: {
      containerSizeId?: string;
      containerConditionId?: string;
      quantity?: number;
      askingPrice?: number;
      notes?: string;
    },
  ) {
    const { data, error } = await supabaseAdmin
      .rpc('validate_inquiry_ticket', {
        p_inquiry_id: inquiryId,
        p_actor_id: actorId,
        p_approved: approved,
        p_rejection_reason: rejectionReason ?? null,
        p_alt_container_size_id: alt.containerSizeId ?? null,
        p_alt_container_condition_id: alt.containerConditionId ?? null,
        p_alt_quantity: alt.quantity ?? null,
        p_alt_asking_price: alt.askingPrice ?? null,
        p_alt_notes: alt.notes ?? null,
      })
      .single();
    if (error) throw new Error(`Failed to validate the inquiry ticket: ${error.message}`);
    return data;
  }

  static async applyInquiryAlternative(inquiryId: string, actorId: string, actorPicId: string) {
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('inquiries')
      .select('id, pic_id')
      .eq('id', inquiryId)
      .maybeSingle();
    if (fetchError) throw new Error(`Failed to look up the ticket: ${fetchError.message}`);
    if (!current) throw new Error('Inquiry not found.');
    if (current.pic_id !== actorPicId) {
      throw new Error('You can only act on tickets currently owned by your own PIC.');
    }

    const { data, error } = await supabaseAdmin
      .rpc('apply_inquiry_alternative', { p_inquiry_id: inquiryId, p_actor_id: actorId })
      .single();
    if (error) throw new Error(`Failed to apply the alternative: ${error.message}`);
    return data;
  }

  static async updateLeadCell(
    stage: 'prospect' | 'warm_lead',
    entityId: string,
    field: string,
    rawValue: string | null | undefined,
    actorId: string,
    picId?: string | null,
    isAdmin: boolean = false,
  ) {
    const table = stage === 'prospect' ? 'prospect_clients' : 'warm_leads';
    let query = supabaseAdmin.from(table).select('*, companies(*), contacts(*)').eq('id', entityId);
    if (!isAdmin && picId) {
      query = query.eq('pic_id', picId);
    }
    const { data: row, error: fetchErr } = await query.single();
    if (fetchErr || !row) {
      throw new Error(`${stage === 'prospect' ? 'Prospect' : 'Warm lead'} not found or unauthorized`);
    }

    const value = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : null;

    if (field === 'company') {
      if (!value) throw new Error('Company name cannot be empty');
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ name: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'industry') {
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ industry: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'country') {
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ address_country: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'state') {
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ address_state: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'city') {
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ address_city: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'address') {
      if (row.company_id) {
        const { error } = await supabaseAdmin.from('companies').update({ address_street: value }).eq('id', row.company_id);
        if (error) throw error;
      }
    } else if (field === 'cat') {
      if (stage === 'prospect') {
        const catVal = value === 'Removed' ? 'Removed' : 'Proceed';
        const statusVal = catVal === 'Removed' ? 'removed' : 'active';
        const { error } = await supabaseAdmin.from('prospect_clients').update({ category: catVal, lifecycle_status: statusVal }).eq('id', entityId);
        if (error) throw error;
      }
    } else if (field === 'sms') {
      if (stage === 'prospect') {
        const sourceData = (row.source_data as Record<string, any>) || {};
        sourceData.sms_deliverability = value;
        const { error } = await supabaseAdmin.from('prospect_clients').update({ source_data: sourceData }).eq('id', entityId);
        if (error) throw error;
      }
    } else if (field === 'email') {
      if (stage === 'prospect') {
        const sourceData = (row.source_data as Record<string, any>) || {};
        sourceData.email_deliverability = value;
        const { error } = await supabaseAdmin.from('prospect_clients').update({ source_data: sourceData }).eq('id', entityId);
        if (error) throw error;
      }
    } else if (field === 'territory') {
      if (stage === 'prospect') {
        const sourceData = (row.source_data as Record<string, any>) || {};
        sourceData.service_locations = value;
        const { error } = await supabaseAdmin.from('prospect_clients').update({ source_data: sourceData }).eq('id', entityId);
        if (error) throw error;
      }
    } else if (field === 'notes') {
      if (stage === 'warm_lead') {
        const { error } = await supabaseAdmin.from('warm_leads').update({ notes: value }).eq('id', entityId);
        if (error) throw error;
      }
    } else if (field === 'pic') {
      let targetPicId: string | null = null;
      if (value) {
        const { data: picData } = await supabaseAdmin.from('pics').select('id').or(`id.eq.${value},name.ilike.${value}`).limit(1).maybeSingle();
        if (picData) targetPicId = picData.id;
      }
      const { error } = await supabaseAdmin.from(table).update({ pic_id: targetPicId }).eq('id', entityId);
      if (error) throw error;
    } else if (['contact', 'phone', 'phone2', 'emailAddr', 'email2'].includes(field)) {
      if (row.contact_id) {
        const contactUpdates: Record<string, any> = {};
        if (field === 'contact') {
          if (value) {
            const parts = value.split(' ');
            contactUpdates.first_name = parts[0];
            contactUpdates.last_name = parts.slice(1).join(' ') || null;
          } else {
            contactUpdates.first_name = '';
            contactUpdates.last_name = null;
          }
        } else if (field === 'phone') {
          contactUpdates.phone_direct = value;
        } else if (field === 'phone2') {
          contactUpdates.phone_2 = value;
        } else if (field === 'emailAddr') {
          contactUpdates.email_active = value;
        } else if (field === 'email2') {
          contactUpdates.email_2 = value;
        }
        const { error } = await supabaseAdmin.from('contacts').update(contactUpdates).eq('id', row.contact_id);
        if (error) throw error;
      } else {
        let firstName = 'Contact';
        let lastName: string | null = null;
        let phoneDirect: string | null = null;
        let phone2: string | null = null;
        let emailActive: string | null = null;
        let email2: string | null = null;

        if (field === 'contact' && value) {
          const parts = value.split(' ');
          firstName = parts[0];
          lastName = parts.slice(1).join(' ') || null;
        } else if (field === 'phone') {
          phoneDirect = value;
        } else if (field === 'phone2') {
          phone2 = value;
        } else if (field === 'emailAddr') {
          emailActive = value;
        } else if (field === 'email2') {
          email2 = value;
        }

        const { data: newContact, error: createContactErr } = await supabaseAdmin
          .from('contacts')
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone_direct: phoneDirect,
            phone_2: phone2,
            email_active: emailActive,
            email_2: email2,
          })
          .select()
          .single();
        if (createContactErr) throw createContactErr;

        if (row.company_id && newContact) {
          await supabaseAdmin.from('company_contacts').insert({
            company_id: row.company_id,
            contact_id: newContact.id,
            is_primary: true,
          });
        }

        if (newContact) {
          await supabaseAdmin.from(table).update({ contact_id: newContact.id }).eq('id', entityId);
        }
      }
    }

    await supabaseAdmin.from('domain_events').insert({
      entity_type: stage,
      entity_id: entityId,
      event_type: `${stage}_cell_updated`,
      actor_id: actorId,
      payload: { field, value },
    });

    return { success: true, stage, entityId, field, value };
  }
}
