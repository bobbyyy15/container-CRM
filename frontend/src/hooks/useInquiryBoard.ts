import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useInquiryBoard = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const liveRevision = useRealtimeRevision(['leads', 'deals'])
  useEffect(() => {
    setLoading(true)
    setLoadError('')
    api.get('/leads/inquiries/board').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => ({
        id: row.id,
        ref: `INQ-${row.id.slice(0, 8).toUpperCase()}`,
        date: new Date(row.created_at).toLocaleDateString(),
        createdAt: row.created_at,
        neededBy: row.needed_by_date ? new Date(row.needed_by_date).toLocaleDateString() : '—',
        status: row.status,
        company: row.companies?.name || '',
        contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
        pic: row.pics?.name || 'Unassigned',
        description: row.requirements || '—',
        size: row.container_sizes?.name || '—',
        condition: row.container_conditions?.name || '—',
        location: [row.state_province, row.country].filter(Boolean).join(', ') || '—',
        quantity: row.quantity ?? '—',
        price: row.asking_price != null ? Number(row.asking_price) : null,
        rejectionReason: row.rejection_reason || '',
        altSize: row.alt_size?.name || '',
        altCondition: row.alt_condition?.name || '',
        altQuantity: row.alt_quantity ?? null,
        altAskingPrice: row.alt_asking_price != null ? Number(row.alt_asking_price) : null,
        altNotes: row.alt_notes || '',
      })));
    }).catch((error: any) => {
      console.error(error)
      setLoadError(error.response?.data?.error?.message ?? 'Could not load the validation queue.')
    }).finally(() => setLoading(false))
  }, [revision, liveRevision])
  return { data, loading, loadError }
}
