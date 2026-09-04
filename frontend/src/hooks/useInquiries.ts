import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useInquiries = (revision = 0, status: 'active' | 'all' = 'active') => {
  const [data, setData] = useState<any[]>([])
  const liveRevision = useRealtimeRevision(['leads', 'deals'])
  useEffect(() => {
    api.get('/leads/inquiries', { params: { limit: 500, status } }).then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
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
          // Carried so the Quick Contact Lookup bar can actually match on phone/email,
          // which is what its placeholder promises.
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
      }))
    }).catch(console.error)
  }, [revision, liveRevision, status])
  return data
}
