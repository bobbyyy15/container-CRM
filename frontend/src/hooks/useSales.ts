import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapSaleRow } from './mappers'
import type { ListResult } from './useProspects'

export const useSales = (revision = 0): ListResult<any> => {
  const cacheKey = 'deals:sales'
  const liveRevision = useRealtimeRevision(['deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapSaleRow) : []
  })
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
      () => api.get('/deals/sales').then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapSaleRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch sales", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [revision, liveRevision])

  // Memoised so a screen gets a new array when the rows change, not on every render.
  return useMemo(() => Object.assign([...data], { data, loading }), [data, loading])
}
