import { supabaseAdmin } from '../config/supabase';
import { ImportRow } from '../schemas/import.schema';
import crypto from 'crypto';

export class ImportService {
  /**
   * Process an array of import rows.
   * Clean rows go directly to production tables (companies, contacts, prospect_clients).
   * Conflicting/ambiguous rows go to import_staging_conflicts.
   */
  static async processBulkImport(rows: ImportRow[], batchId?: string) {
    const activeBatchId = batchId || crypto.randomUUID();
    const results = {
      cleanCount: 0,
      conflictCount: 0,
      batchId: activeBatchId
    };

    for (const row of rows) {
      // 1. Basic normalization
      const normEmail = row.email_active?.trim().toLowerCase() || null;
      // In a real app, use a phone formatting library to normalize phone numbers
      const normPhone = row.contact_number_direct?.replace(/\\D/g, '') || null; 

      // 2. Duplicate detection
      // Check if company exists by name
      const { data: existingCompany } = await supabaseAdmin
        .from('companies')
        .select('id, name')
        .ilike('name', row.company_name.trim())
        .maybeSingle();

      // Check if contact exists by normalized email or phone
      let existingContact = null;
      if (normEmail || normPhone) {
        let query = supabaseAdmin.from('contacts').select('id, email_active, phone_direct');
        
        if (normEmail && normPhone) {
          query = query.or(`email_active_normalized.eq.${normEmail},phone_direct_normalized.eq.${normPhone}`);
        } else if (normEmail) {
          query = query.eq('email_active_normalized', normEmail);
        } else if (normPhone) {
          query = query.eq('phone_direct_normalized', normPhone);
        }

        const { data: contacts } = await query;
        if (contacts && contacts.length > 0) {
          // If multiple match, it's an ambiguous conflict
          if (contacts.length > 1) {
            await this.stageConflict(activeBatchId, row, 'Multiple contacts matched email/phone', contacts);
            results.conflictCount++;
            continue;
          }
          existingContact = contacts[0];
        }
      }

      // If we found an existing contact OR company, we consider it a conflict for staging to let the user review
      // Alternatively, we could auto-merge, but the grill-me session requested safe conflict queueing.
      if (existingCompany || existingContact) {
        await this.stageConflict(activeBatchId, row, 'Duplicate candidate found', {
          company: existingCompany,
          contact: existingContact
        });
        results.conflictCount++;
        continue;
      }

      // 3. Clean Row: Insert into master data and pipeline
      try {
        await this.insertCleanRow(row);
        results.cleanCount++;
      } catch (err: any) {
        // If DB insertion fails, dump to staging queue
        await this.stageConflict(activeBatchId, row, `Insertion error: ${err.message}`, null);
        results.conflictCount++;
      }
    }

    return results;
  }

  private static async stageConflict(batchId: string, row: ImportRow, reason: string, matches: any) {
    await supabaseAdmin.from('import_staging_conflicts').insert({
      batch_id: batchId,
      raw_data: row,
      conflict_reason: reason,
      candidate_matches: matches,
      status: 'pending'
    });
  }

  private static async insertCleanRow(row: ImportRow) {
    // Note: A true production implementation would use a Postgres function (RPC) 
    // to guarantee atomicity of these multiple inserts.

    // A. Create Company
    const { data: company, error: coErr } = await supabaseAdmin.from('companies').insert({
      name: row.company_name.trim(),
      industry: row.industry || null,
      address_street: row.address || null,
      address_city: row.city || null,
      address_state: row.state_province || null,
      address_country: row.country || null,
    }).select('id').single();
    if (coErr) throw coErr;

    // B. Create Contact
    // Split contact person into first and last name roughly
    const nameParts = row.contact_person.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;
    
    const { data: contact, error: cntErr } = await supabaseAdmin.from('contacts').insert({
      first_name: firstName,
      last_name: lastName,
      phone_direct: row.contact_number_direct || null,
      phone_direct_normalized: row.contact_number_direct?.replace(/\\D/g, '') || null,
      email_active: row.email_active || null,
      email_active_normalized: row.email_active?.trim().toLowerCase() || null,
    }).select('id').single();
    if (cntErr) throw cntErr;

    // C. Link Company and Contact
    await supabaseAdmin.from('company_contacts').insert({
      company_id: company.id,
      contact_id: contact.id,
      is_primary: true
    });

    // D. Create Prospect Client
    await supabaseAdmin.from('prospect_clients').insert({
      company_id: company.id,
      contact_id: contact.id,
      category: row.category || 'Proceed',
      source_data: row // Store original import row
    });
  }
}
