import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapInquiryRow } from './mappers'
import { fetchAllPages } from '../lib/fetchAllPages'

export const useInquiries = (revision = 0, status: 'active' | 'all' = 'active') => {
  const cacheKey = `leads:inquiries:${status}`
  const liveRevision = useRealtimeRevision(['leads', 'deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapInquiryRow) : []
  })

  useEffect(() => {
    let cancelled = false
    // Every inquiry, not the first page: the same cap that hid most of the prospect list.
    fetchCached(cacheKey, () => fetchAllPages('/leads/inquiries', { status }), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapInquiryRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision, status])

  return data
}
