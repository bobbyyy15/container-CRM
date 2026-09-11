import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { fetchAllPages } from '../lib/fetchAllPages'
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
    // Every prospect, not the first page of them: rows appear as each page lands so a
    // large pipeline fills in progressively instead of showing nothing for several seconds.
    fetchCached(
      cacheKey,
      () => fetchAllPages('/leads/prospects', { status }, rows => {
        if (!cancelled) setProspects(rows.map(mapPipelineRow))
      }),
      60_000,
    )
      .then(raw => {
        if (!cancelled) setProspects((raw || []).map(mapPipelineRow))
      })
      .catch(e => console.error("Failed to fetch API data", e))
    return () => { cancelled = true }
  }, [revision, liveRevision, status, enabled])

  return prospects
}
