-- 002_pipeline_schema.sql
-- Pipeline entities (Prospects, Warm Leads, Inquiries, Staging)

-- 1. Pipeline Entities
CREATE TABLE prospect_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,
    contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    pic_id UUID REFERENCES pics(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'Proceed',
    source_data JSONB, -- For storing original import context if needed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warm_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_prospect_id UUID REFERENCES prospect_clients(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    pic_id UUID REFERENCES pics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_warm_lead_id UUID REFERENCES warm_leads(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    pic_id UUID REFERENCES pics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Under Review',
    requirements TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. System and Audit Tables
CREATE TABLE domain_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL, -- e.g., 'prospect', 'warm_lead'
    entity_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- e.g., 'converted_to_warm_lead'
    payload JSONB,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_staging_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL,
    raw_data JSONB NOT NULL,
    conflict_reason TEXT NOT NULL,
    candidate_matches JSONB,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, resolved, discarded
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers
CREATE TRIGGER set_timestamp_prospect_clients
BEFORE UPDATE ON prospect_clients
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_warm_leads
BEFORE UPDATE ON warm_leads
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_inquiries
BEFORE UPDATE ON inquiries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_import_staging_conflicts
BEFORE UPDATE ON import_staging_conflicts
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
