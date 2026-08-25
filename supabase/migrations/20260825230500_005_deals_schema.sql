-- 005_deals_schema.sql
-- Quotations, Sales, Contracts

CREATE TABLE quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES inquiries(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    pic_id UUID REFERENCES pics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Sent, Viewed, Accepted, Rejected, Converted
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    valid_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_id UUID REFERENCES quotations(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    pic_id UUID REFERENCES pics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    total_units INTEGER NOT NULL DEFAULT 1,
    buying_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contract_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Pending Signature',
    delivery_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
CREATE TRIGGER set_timestamp_quotations
BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_sales
BEFORE UPDATE ON sales FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_contracts
BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- RLS
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quotation view" ON quotations FOR SELECT USING (true);
CREATE POLICY "Quotation insert" ON quotations FOR INSERT WITH CHECK (true);
CREATE POLICY "Quotation update" ON quotations FOR UPDATE USING (true);

CREATE POLICY "Sale view" ON sales FOR SELECT USING (true);
CREATE POLICY "Sale insert" ON sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Sale update" ON sales FOR UPDATE USING (true);

CREATE POLICY "Contract view" ON contracts FOR SELECT USING (true);
CREATE POLICY "Contract insert" ON contracts FOR INSERT WITH CHECK (true);
CREATE POLICY "Contract update" ON contracts FOR UPDATE USING (true);

NOTIFY pgrst, 'reload schema';
