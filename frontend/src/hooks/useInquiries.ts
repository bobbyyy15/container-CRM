import { useState, useEffect, useMemo, useRef } from 'react'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { fetchAllPages } from '../lib/fetchAllPages'
import { mapInquiryRow } from './mappers'
import type { ListResult } from './useProspects'

export const useInquiries = (revision = 0, status: 'active' | 'all' = 'active'): ListResult<any> => {
  const cacheKey = `leads:inquiries:${status}`
  const liveRevision = useRealtimeRevision(['leads', 'deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapInquiryRow) : []
  })
  const [loading, setLoading] = useState<boolean>(() => !getFromCache(cacheKey))
  const isFirstMount = useRef(true)
  const prevRevision = useRef(revision)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    let cancelled = false
    // A bumped revision means the rows changed, so read past the cache instead of re-serving it.
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    if (!getFromCache(cacheKey) && !shouldBypass) setLoading(true)

    // Every inquiry, not the first page: the same cap that hid most of the prospect list.
    fetchCached(cacheKey, () => fetchAllPages('/leads/inquiries', { status }), 60_000, shouldBypass)
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapInquiryRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error('Failed to fetch inquiries', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision, status])

  // Memoised so a screen gets a new array when the rows change, not on every render --
  // these results sit in effect and memo dependency lists.
  return useMemo(() => Object.assign([...data], { data, loading }), [data, loading])
}
