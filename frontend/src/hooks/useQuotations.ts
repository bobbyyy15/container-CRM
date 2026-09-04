import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useQuotations = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const liveRevision = useRealtimeRevision(['deals', 'leads'])
  useEffect(() => {
    api.get('/deals/quotations').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
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
      }))
    }).catch(console.error)
  }, [revision, liveRevision])
  return data
}
