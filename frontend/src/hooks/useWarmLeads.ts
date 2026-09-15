import { useState, useEffect, useMemo, useRef } from 'react'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { fetchAllPages } from '../lib/fetchAllPages'
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
    // A bumped revision means the rows changed, so read past the cache instead of re-serving it.
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    if (!getFromCache(cacheKey) && !shouldBypass) setLoading(true)

    // Every warm lead, not the first page.
    fetchCached(cacheKey, () => fetchAllPages('/leads/warm-leads'), 60_000, shouldBypass)
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapPipelineRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error('Failed to fetch warm leads', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision, enabled])

  // Memoised so a screen gets a new array when the rows change, not on every render.
  return useMemo(() => Object.assign([...data], { data, loading }), [data, loading])
}
