import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapQuotationRow } from './mappers'

export const useQuotations = (revision = 0) => {
  const cacheKey = 'deals:quotations'
  const liveRevision = useRealtimeRevision(['deals', 'leads'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapQuotationRow) : []
  })

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/deals/quotations').then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapQuotationRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision])

  return data
}
