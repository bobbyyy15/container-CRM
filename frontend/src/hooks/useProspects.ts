import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapPipelineRow } from './mapPipelineRow'

export type ListResult<T> = T[] & {
  data: T[]
  loading: boolean
}

export const useProspects = (revision = 0, status: 'active' | 'converted' | 'removed' | 'all' = 'active', enabled = true): ListResult<any> => {
  const cacheKey = `leads:prospects:${status}`
  const liveRevision = useRealtimeRevision(['leads', 'data'])
  const [prospects, setProspects] = useState<any[]>(() => {
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
      () => api.get('/leads/prospects', { params: { limit: 500, status } }).then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(raw => {
        if (!cancelled) {
          setProspects((raw || []).map(mapPipelineRow))
          setLoading(false)
        }
      })
      .catch(e => {
        console.error("Failed to fetch API data", e)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision, status, enabled])

  return Object.assign([...prospects], { data: prospects, loading })
}
