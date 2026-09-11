import { useState, useEffect } from 'react'
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
  const liveRevision = useRealtimeRevision([])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/analytics/dashboard', { params: { range } }).then(res => res.data.data), 45_000)
      .then(fresh => {
        if (!cancelled) setData(fresh)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [liveRevision, range])

  return data
}
