import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapPipelineRow } from './mapPipelineRow'

export const useWarmLeads = (revision = 0, enabled = true) => {
  const cacheKey = 'leads:warm-leads:active'
  const liveRevision = useRealtimeRevision(['leads', 'data'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapPipelineRow) : []
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/leads/warm-leads', { params: { limit: 500 } }).then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapPipelineRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision, enabled])

  return data
}
