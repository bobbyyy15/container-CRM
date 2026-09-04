import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapPipelineRow } from './mapPipelineRow'

export const useProspects = (revision = 0, status: 'active' | 'converted' | 'removed' | 'all' = 'active', enabled = true) => {
  const cacheKey = `leads:prospects:${status}`
  const liveRevision = useRealtimeRevision(['leads', 'data'])
  const [prospects, setProspects] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapPipelineRow) : []
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/leads/prospects', { params: { limit: 500, status } }).then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setProspects((raw || []).map(mapPipelineRow))
      })
      .catch(e => console.error("Failed to fetch API data", e))
    return () => { cancelled = true }
  }, [revision, liveRevision, status, enabled])

  return prospects
}
