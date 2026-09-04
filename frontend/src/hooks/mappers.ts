// Row shapes for the list views. These were split out of the hooks so a cached
// payload can be re-mapped without refetching -- the hook reads raw rows from
// the cache on first paint, then maps them through here.

export const mapInquiryRow = (row: any) => {
  const created = new Date(row.created_at)
  return {
    id: row.id,
    companyId: row.company_id,
    contactId: row.contact_id,
    ref: `INQ-${row.id.slice(0, 8).toUpperCase()}`,
    date: created.toLocaleDateString(),
    time: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    channel: row.requirements?.match(/email/i) ? 'Email' : 'Direct',
    company: row.companies?.name || '',
    contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
    phone: row.contacts?.phone_direct || row.contacts?.phone_2 || '',
    email: row.contacts?.email_active || row.contacts?.email_2 || '',
    category: row.requirements || 'To be qualified',
    size: row.container_sizes?.name || '—',
    condition: row.container_conditions?.name || '—',
    qty: row.quantity ?? '—',
    neededBy: row.needed_by_date ? new Date(row.needed_by_date).toLocaleDateString() : '—',
    status: row.status || 'Under Review',
    pic: row.pics?.name || 'Unassigned',
    sourceWarmLeadId: row.source_warm_lead_id || null,
    backfilledWarmLeadId: Array.isArray(row.backfilled_warm_leads)
      ? row.backfilled_warm_leads[0]?.id || null
      : row.backfilled_warm_leads?.id || null,
    entryOrigin: row.entry_origin || (row.source_warm_lead_id ? 'warm_lead_conversion' : 'direct'),
    rejectionReason: row.rejection_reason || '',
    altSize: row.alt_size?.name || '',
    altCondition: row.alt_condition?.name || '',
    altQuantity: row.alt_quantity ?? null,
    altAskingPrice: row.alt_asking_price != null ? Number(row.alt_asking_price) : null,
    altNotes: row.alt_notes || '',
    hasAlternative: !!(row.alt_size || row.alt_condition || row.alt_quantity != null || row.alt_asking_price != null),
  }
}

export const mapQuotationRow = (row: any) => {
  const items = row.quotation_items || []
  const quantity = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
  const total = Number(row.total_amount || 0)
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    ref: `QUO-${row.id.slice(0, 8).toUpperCase()}`,
    date: new Date(row.created_at).toLocaleDateString(),
    co: row.companies?.name || '',
    contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
    category: items[0]?.description || 'Container',
    size: '—',
    qty: quantity,
    sellTotal: total,
    profit: 0,
    margin: 0,
    status: row.status,
    source: row.inquiry_id ? `INQ-${row.inquiry_id.slice(0, 8).toUpperCase()}` : 'Direct',
    pic: row.pics?.name || 'Unassigned',
  }
}

export const mapSaleRow = (row: any) => {
  const units = Number(row.total_units || 0)
  const buyingCost = Number(row.buying_cost || 0)
  const revenue = Number(row.revenue || 0)
  const profit = Number(row.gross_profit || 0)
  const quote = row.quotations || {}
  const item = quote.quotation_items?.[0]
  const fullName = (c: any) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : ''
  const companyLinks = row.companies?.company_contacts ?? []
  const companyContact = (companyLinks.find((l: any) => l.is_primary) ?? companyLinks[0])?.contacts
  return {
    id: row.id,
    ref: `SAL-${row.id.slice(0, 8).toUpperCase()}`,
    date: new Date(row.created_at).toLocaleDateString(),
    createdAt: row.created_at,
    company: row.companies?.name || '',
    contact: fullName(quote.contacts) || fullName(companyContact),
    category: item?.description || 'Container',
    size: '—',
    condition: '—',
    qty: units,
    buyPU: units ? buyingCost / units : 0,
    sellPU: units ? revenue / units : 0,
    totalBuy: buyingCost,
    totalSell: revenue,
    profit,
    margin: revenue ? (profit / revenue) * 100 : 0,
    pic: row.pics?.name || 'Unassigned',
    status: row.status,
  }
}

export const mapCustomerRow = (c: any) => ({
  id: c.company_id,
  co: c.company_name,
  contact: c.primary_contact ? c.primary_contact.first_name + ' ' + (c.primary_contact.last_name || '') : '-',
  phone: c.primary_contact ? (c.primary_contact.phone_1 || c.primary_contact.phone_2) : '-',
  email: c.primary_contact ? (c.primary_contact.email || '-') : '-',
  state: c.state || '-',
  country: c.country || '-',
  sales: c.sales_count,
  units: c.total_units,
  revenue: Number(c.total_revenue),
  profit: Number(c.total_gross_profit),
  last: new Date(c.last_purchase_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  pic: c.pic_name || '-',
  status: c.status
})

// `enabled` exists because ProspectSheet renders both the Prospect and Warm Lead
// views from one component -- without it, opening either page fetched both lists.

export const mapContractRow = (c: any) => ({
  id: c.id,
  ref: c.contract_number,
  co: c.company_name,
  contact: c.primary_contact ? c.primary_contact.first_name + ' ' + (c.primary_contact.last_name || '') : '-',
  category: c.items && c.items.length > 0 ? c.items[0].description.split(' ')[0] : '-',
  size: c.items && c.items.length > 0 ? c.items[0].description : '-',
  qty: c.allocated_quantity ?? c.total_units,
  value: Number(c.revenue),
  pickup: c.pickup_date ? new Date(c.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unscheduled',
  pickupDateRaw: c.pickup_date ? String(c.pickup_date).slice(0, 10) : '',
  pickStatus: c.pickup_status,
  storedPickStatus: c.stored_pickup_status || c.pickup_status,
  status: c.contract_status,
  pic: c.pic_name || '-',
  sale: c.sale_number,
  inventory: c.inventory_label || 'Legacy contract — no stock allocation',
})
