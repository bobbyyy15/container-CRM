import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'

/**
 * `range` selects which window the sales KPIs cover ('month' | 'quarter' | 'year' | 'all').
 * It is part of the cache key: each window is a different answer, and sharing one entry
 * would show the previous selection's numbers under the new label.
 */
export const useAnalytics = (range = 'month') => {
  const cacheKey = `analytics:dashboard:${range}`
  const liveRevision = useRealtimeRevision(['deals', 'leads', 'contracts', 'inventory'])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)
  const isFirstMount = useRef(true)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    let cancelled = false
    // A live change means the figures moved, so read past the cache instead of re-serving it.
    const shouldBypass = !isFirstMount.current && prevLiveRevision.current !== liveRevision
    isFirstMount.current = false
    prevLiveRevision.current = liveRevision

    fetchCached(cacheKey, () => api.get('/analytics/dashboard', { params: { range } }).then(res => res.data.data), 45_000, shouldBypass)
      .then(fresh => {
        if (!cancelled) setData(fresh)
      })
      .catch(err => console.error('Failed to fetch analytics', err))
    return () => { cancelled = true }
  }, [liveRevision, range])

  return data
}
