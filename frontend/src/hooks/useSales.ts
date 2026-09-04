import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapSaleRow } from './mappers'

export const useSales = (revision = 0) => {
  const cacheKey = 'deals:sales'
  const liveRevision = useRealtimeRevision(['deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapSaleRow) : []
  })

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/deals/sales').then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapSaleRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision])

  return data
}
