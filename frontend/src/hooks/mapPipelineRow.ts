// Row shape shared by the prospect and warm-lead spreadsheet views.

export const mapPipelineRow = (p: any) => ({
  id: p.id,
  added: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  pic: p.pics?.name || 'Unassigned',
  cat: p.category || (p.status === 'active' ? 'Proceed' : p.status) || 'Proceed',
  sms: p.source_data?.sms_deliverability || 'Call/Text',
  email: p.source_data?.email_deliverability || (p.contacts?.email_active ? 'Available' : 'Unavailable'),
  industry: p.companies?.industry || '',
  territory: p.source_data?.service_locations || '',
  country: p.companies?.address_country || '',
  state: p.companies?.address_state || '',
  city: p.companies?.address_city || '',
  company: p.companies?.name || '',
  contact: p.contacts ? `${p.contacts.first_name || ''} ${p.contacts.last_name || ''}`.trim() : '',
  contactMissing: !p.contact_id,
  phone: p.contacts?.phone_direct || '',
  phone2: p.contacts?.phone_2 || '',
  emailAddr: p.contacts?.email_active || '',
  email2: p.contacts?.email_2 || '',
  address: p.companies?.address_street || '',
  lifecycleStatus: p.lifecycle_status || 'active',
  conversionReason: p.conversion_reason || '',
  conversionChannel: p.conversion_channel || '',
  entryPath: p.entry_origin === 'inquiry_backfill'
    ? 'From Inquiry'
    : p.entry_origin === 'prospect_conversion'
      ? 'From Prospect'
      : 'Direct Entry',
})

