import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'

export const useAnalytics = () => {
  const cacheKey = 'analytics:dashboard'
  const liveRevision = useRealtimeRevision([])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/analytics/dashboard').then(res => res.data.data), 45_000)
      .then(fresh => {
        if (!cancelled) setData(fresh)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [liveRevision])

  return data
}
