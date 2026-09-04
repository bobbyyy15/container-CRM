import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { fetchCached, getFromCache } from '../lib/dataCache'
import { mapContractRow } from './mappers'

export const useContracts = (status = 'All Statuses', pickStatus = 'All Pickup Statuses', search = '', revision = 0) => {
  const cacheKey = `contracts:${status}:${pickStatus}:${search}`
  const liveRevision = useRealtimeRevision(['contracts', 'deals']);
  const [data, setData] = useState<any[]>(() => {
    const cached = getFromCache<any[]>(cacheKey)
    return cached ? cached.map(mapContractRow) : []
  });

  useEffect(() => {
    let cancelled = false;
    fetchCached(cacheKey, () => api.get('/contracts', { params: { status, pickStatus, search } }).then(res => res.data.data || []), 60_000)
      .then(raw => {
        if (!cancelled) setData((raw || []).map(mapContractRow));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [status, pickStatus, search, revision, liveRevision]);

  return data;
}

// `limit` keeps the dashboard's "top 5" from pulling the entire customer table
// across the network just to discard almost all of it.
