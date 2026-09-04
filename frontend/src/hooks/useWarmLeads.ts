import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'
import { mapPipelineRow } from './mapPipelineRow'

export const useWarmLeads = (revision = 0, enabled = true) => {
  const [data, setData] = useState<any[]>([])
  const liveRevision = useRealtimeRevision(['leads', 'data'])
  useEffect(() => {
    if (!enabled) return
    api.get('/leads/warm-leads', { params: { limit: 500 } }).then(res => {
      if (res.data.success) setData((res.data.data || []).map(mapPipelineRow))
    }).catch(console.error)
  }, [revision, liveRevision, enabled])
  return data
}
