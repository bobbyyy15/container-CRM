import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'

export const useAnalytics = () => {
  const cacheKey = 'analytics:dashboard'
  const liveRevision = useRealtimeRevision(['deals', 'leads', 'contracts', 'inventory'])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)
  const [loading, setLoading] = useState<boolean>(() => !getFromCache(cacheKey))
  const isFirstMount = useRef(true)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    let cancelled = false
    const shouldBypass = !isFirstMount.current && prevLiveRevision.current !== liveRevision
    isFirstMount.current = false
    prevLiveRevision.current = liveRevision

    const cached = getFromCache(cacheKey)
    if (!cached && !shouldBypass) setLoading(true)

    fetchCached(
      cacheKey,
      () => api.get('/analytics/dashboard').then(res => res.data.data),
      45_000,
      shouldBypass
    )
      .then(fresh => {
        if (!cancelled) {
          setData(fresh)
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch analytics", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [liveRevision])

  return data
}
