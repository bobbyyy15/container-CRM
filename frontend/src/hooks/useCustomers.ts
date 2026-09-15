import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapCustomerRow } from './mappers'
import type { ListResult } from './useProspects'

export const useCustomers = (
  status = 'All',
  search = '',
  revision = 0,
  limit?: number,
  scope?: 'personal' | 'master',
  picId?: string
): ListResult<any> => {
  const cacheKey = `customers:${scope ?? 'default'}:${picId ?? 'all'}:${status}:${search}:${limit ?? 'all'}`
  const liveRevision = useRealtimeRevision(['deals', 'contracts'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapCustomerRow) : []
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
      () =>
        api.get('/customers', {
          params: {
            status,
            search,
            ...(limit ? { limit } : {}),
            ...(scope ? { scope } : {}),
            ...(picId ? { pic_id: picId } : {}),
          },
        }).then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapCustomerRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch customers", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [status, search, revision, liveRevision, limit, scope, picId])

  // Memoised so a screen gets a new array when the rows change, not on every render.
  return useMemo(() => Object.assign([...data], { data, loading }), [data, loading])
}
