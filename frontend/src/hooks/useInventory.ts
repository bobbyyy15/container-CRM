import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'

export const useInventory = (filters: Record<string, string> = {}, revision = 0) => {
  const cacheKey = `inventory:${JSON.stringify(filters)}`
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  const [data, setData] = useState<any[]>(() => getFromCache<any[]>(cacheKey) ?? [])

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/inventory', { params: filters }).then(res => res.data.data || []), 60_000)
      .then(fresh => {
        if (!cancelled) setData(fresh)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [JSON.stringify(filters), revision, liveRevision])

  return data
}

export const useInventorySummary = (revision = 0) => {
  const cacheKey = 'inventory:summary'
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)

  useEffect(() => {
    let cancelled = false
    fetchCached(cacheKey, () => api.get('/inventory/summary').then(res => res.data.data), 60_000)
      .then(fresh => {
        if (!cancelled) setData(fresh)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [revision, liveRevision])

  return data
}

// ─── Icon primitives ─────────────────────────────────────────────────────────
