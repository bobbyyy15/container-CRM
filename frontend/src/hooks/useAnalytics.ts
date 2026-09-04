import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useAnalytics = () => {
  const [data, setData] = useState<any>(null)
  const liveRevision = useRealtimeRevision([])
  useEffect(() => {
    api.get('/analytics/dashboard').then(res => {
      if (res.data.success) setData(res.data.data)
    }).catch(console.error)
  }, [liveRevision])
  return data
}
