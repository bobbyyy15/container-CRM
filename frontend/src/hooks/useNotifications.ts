import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useNotifications = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const liveRevision = useRealtimeRevision(['notifications', 'leads'])
  const refresh = useCallback(() => {
    api.get('/notifications').then(res => {
      if (res.data.success) {
        setData(res.data.data || [])
        setUnread(res.data.meta?.unread ?? 0)
      }
    }).catch(console.error)
  }, [])
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh, revision, liveRevision])
  return { notifications: data, unread, refresh }
}
