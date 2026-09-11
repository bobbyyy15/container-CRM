-- Deleting one prospect took over a second, and a thousand at once exceeded the statement
-- timeout. The cause is not the delete itself: Postgres has to check every foreign key that
-- points AT the row being deleted, and an unindexed referencing column means a sequential
-- scan of that whole table per row deleted.
--
-- prospect_clients is referenced by warm_leads.source_prospect_id (ON DELETE RESTRICT) and
-- import_rows.prospect_id (ON DELETE SET NULL), neither indexed. With 35,000 import rows on
-- file, deleting 1,000 prospects meant 1,000 scans of import_rows -- and it grows with every
-- import, so this gets worse over time.
--
-- Postgres indexes the referenced side of a foreign key automatically, never the
-- referencing side. These are the referencing columns across the pipeline, so deletes,
-- cascades and the joins that follow a record to its later stages all use an index.

-- prospect_clients
CREATE INDEX IF NOT EXISTS idx_warm_leads_source_prospect ON public.warm_leads(source_prospect_id) WHERE source_prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_rows_prospect ON public.import_rows(prospect_id) WHERE prospect_id IS NOT NULL;

-- warm_leads / inquiries
CREATE INDEX IF NOT EXISTS idx_inquiries_source_warm_lead ON public.inquiries(source_warm_lead_id) WHERE source_warm_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warm_leads_source_inquiry ON public.warm_leads(source_inquiry_id) WHERE source_inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_inquiry ON public.quotations(inquiry_id) WHERE inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_quotation ON public.sales(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);

-- companies and contacts: every stage points at them, and a company or contact is deleted
-- whenever a mistaken import is cleaned up.
CREATE INDEX IF NOT EXISTS idx_prospect_clients_company ON public.prospect_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_prospect_clients_contact ON public.prospect_clients(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warm_leads_company ON public.warm_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_warm_leads_contact ON public.warm_leads(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_company ON public.inquiries(company_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_contact ON public.inquiries(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_company ON public.import_rows(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_rows_contact ON public.import_rows(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_rows_batch ON public.import_rows(batch_id);

-- The import itself looks companies and contacts up by normalized identity on every row.
CREATE INDEX IF NOT EXISTS idx_companies_name_normalized ON public.companies(name_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized ON public.contacts(email_active_normalized) WHERE email_active_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email2_normalized ON public.contacts(email_2_normalized) WHERE email_2_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON public.contacts(phone_direct_normalized) WHERE phone_direct_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone2_normalized ON public.contacts(phone_2_normalized) WHERE phone_2_normalized IS NOT NULL;

ANALYZE public.prospect_clients;
ANALYZE public.import_rows;
ANALYZE public.companies;
ANALYZE public.contacts;
