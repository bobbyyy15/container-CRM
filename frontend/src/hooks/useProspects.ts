import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { mapPipelineRow } from './mapPipelineRow'

export const useProspects = (revision = 0, status: 'active' | 'converted' | 'removed' | 'all' = 'active', enabled = true) => {
  const [prospects, setProspects] = useState<any[]>([]);
  const liveRevision = useRealtimeRevision(['leads', 'data']);
  useEffect(() => {
    if (!enabled) return;
    api.get('/leads/prospects', { params: { limit: 500, status } }).then(res => {
      const data = (res.data.data || []).map(mapPipelineRow);
      setProspects(data);
    }).catch(e => console.error("Failed to fetch API data", e));
  }, [revision, liveRevision, status, enabled]);
  return prospects;
}
