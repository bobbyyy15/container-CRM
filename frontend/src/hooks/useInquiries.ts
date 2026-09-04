import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapInquiryRow } from './mappers'

export const useInquiries = (revision = 0, status: 'active' | 'all' = 'active') => {
  const cacheKey = `leads:inquiries:${status}`
  const liveRevision = useRealtimeRevision(['leads', 'deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapInquiryRow) : []
  })

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/leads/inquiries', { params: { limit: 500, status } }).then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapInquiryRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision, status])

  return data
}
