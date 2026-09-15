import { useState, useEffect, useMemo, useRef } from 'react'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { fetchAllPages } from '../lib/fetchAllPages'
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
    // A bumped revision means the rows changed, so read past the cache instead of re-serving it.
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    if (!getFromCache(cacheKey) && !shouldBypass) setLoading(true)

    // Every prospect, not the first page of them. On a first load rows appear as each page
    // lands; a refresh keeps the full list on screen until the new one is complete, rather
    // than shrinking it to the first page and growing it back.
    fetchCached(
      cacheKey,
      () => fetchAllPages('/leads/prospects', { status }, shouldBypass ? undefined : rows => {
        if (!cancelled) setProspects(rows.map(mapPipelineRow))
      }),
      60_000,
      shouldBypass,
    )
      .then(raw => {
        if (!cancelled) {
          setProspects((raw || []).map(mapPipelineRow))
          setLoading(false)
        }
      })
      .catch(e => {
        console.error('Failed to fetch API data', e)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision, status, enabled])

  // Memoised so a screen gets a new array when the rows change, not on every render --
  // these results sit in effect and memo dependency lists.
  return useMemo(() => Object.assign([...prospects], { data: prospects, loading }), [prospects, loading])
}
