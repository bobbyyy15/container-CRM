import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useCatalogList = (path: string) => {
  const [data, setData] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    api.get(path).then(res => { if (res.data.success) setData(res.data.data || []) }).catch(console.error)
  }, [path])
  return data
}
