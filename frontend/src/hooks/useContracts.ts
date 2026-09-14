import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapContractRow } from './mappers'
import type { ListResult } from './useProspects'

export const useContracts = (
  status = 'All Statuses',
  pickStatus = 'All Pickup Statuses',
  search = '',
  revision = 0
): ListResult<any> => {
  const cacheKey = `contracts:${status}:${pickStatus}:${search}`
  const liveRevision = useRealtimeRevision(['contracts', 'deals'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapContractRow) : []
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
      () => api.get('/contracts', { params: { status, pickStatus, search } }).then(res => res.data.data || []),
      60_000,
      shouldBypass
    )
      .then(raw => {
        if (!cancelled) {
          setData((raw || []).map(mapContractRow))
          setLoading(false)
        }
      })
      .catch(err => {
        console.error("Failed to fetch contracts", err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [status, pickStatus, search, revision, liveRevision])

  return Object.assign([...data], { data, loading })
}
