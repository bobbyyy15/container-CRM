import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapCustomerRow } from './mappers'

export const useCustomers = (status = 'All', search = '', revision = 0, limit?: number, scope?: 'personal' | 'master', picId?: string) => {
  const cacheKey = `customers:${scope ?? 'default'}:${picId ?? 'all'}:${status}:${search}:${limit ?? 'all'}`
  const liveRevision = useRealtimeRevision(['deals', 'contracts'])
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapCustomerRow) : []
  })

  useEffect(() => {
    let cancelled = false
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
      60_000
    )
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapCustomerRow))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [status, search, revision, liveRevision, limit, scope, picId])

  return data
}
