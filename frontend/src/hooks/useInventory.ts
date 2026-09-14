import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import type { ListResult } from './useProspects'

export const useInventory = (filters: Record<string, string> = {}, revision = 0): ListResult<any> => {
  const cacheKey = `inventory:${JSON.stringify(filters)}`
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  const [data, setData] = useState<any[]>(() => getFromCache<any[]>(cacheKey) ?? [])
  const [loading, setLoading] = useState<boolean>(() => !getFromCache(cacheKey))
  const isFirstMount = useRef(true)
  const prevRevision = useRef(revision)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    let cancelled = false
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    const cached = getFromCache<any[]>(cacheKey)
    if (!cached && !shouldBypass) setLoading(true)

    fetchCached(
      cacheKey,
      () => api.get('/inventory', { params: filters }).then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(fresh => {
        if (!cancelled) {
          setData(fresh)
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch inventory", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [JSON.stringify(filters), revision, liveRevision])

  return Object.assign([...data], { data, loading })
}

export const useInventorySummary = (revision = 0) => {
  const cacheKey = 'inventory:summary'
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  const [data, setData] = useState<any>(() => getFromCache(cacheKey) ?? null)
  const [loading, setLoading] = useState<boolean>(() => !getFromCache(cacheKey))
  const isFirstMount = useRef(true)
  const prevRevision = useRef(revision)
  const prevLiveRevision = useRef(liveRevision)

  useEffect(() => {
    let cancelled = false
    const shouldBypass = !isFirstMount.current && (prevRevision.current !== revision || prevLiveRevision.current !== liveRevision)
    isFirstMount.current = false
    prevRevision.current = revision
    prevLiveRevision.current = liveRevision

    const cached = getFromCache(cacheKey)
    if (!cached && !shouldBypass) setLoading(true)

    fetchCached(
      cacheKey,
      () => api.get('/inventory/summary').then(res => res.data.data),
      60_000,
      shouldBypass
    )
      .then(fresh => {
        if (!cancelled) {
          setData(fresh)
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch inventory summary", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision])

  return data
}
