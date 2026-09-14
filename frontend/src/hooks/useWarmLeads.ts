import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapPipelineRow } from './mapPipelineRow'
import type { ListResult } from './useProspects'

export const useWarmLeads = (revision = 0, enabled = true): ListResult<any> => {
  const cacheKey = 'leads:warm-leads:active'
  const liveRevision = useRealtimeRevision(['leads', 'data'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapPipelineRow) : []
  })
  const [loading, setLoading] = useState<boolean>(() => !getFromCache(cacheKey))
  const isFirstMount = useRef(true)
  const prevRevision = useRef(revision)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    const cached = getFromCache<any[]>(cacheKey)
    if (!cached && !shouldBypass) setLoading(true)

    fetchCached(
      cacheKey,
      () => api.get('/leads/warm-leads', { params: { limit: 500 } }).then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapPipelineRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch warm leads", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision, enabled])

  return Object.assign([...data], { data, loading })
}
