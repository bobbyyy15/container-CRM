import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useInventory = (filters: Record<string, string> = {}, revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  useEffect(() => {
    api.get('/inventory', { params: filters }).then(res => {
      if (res.data.success) setData(res.data.data || [])
    }).catch(console.error)
  }, [JSON.stringify(filters), revision, liveRevision])
  return data
}

export const useInventorySummary = (revision = 0) => {
  const [data, setData] = useState<any>(null)
  const liveRevision = useRealtimeRevision(['inventory', 'contracts'])
  useEffect(() => {
    api.get('/inventory/summary').then(res => {
      if (res.data.success) setData(res.data.data)
    }).catch(console.error)
  }, [revision, liveRevision])
  return data
}

// ─── Icon primitives ─────────────────────────────────────────────────────────



// ─── Types ───────────────────────────────────────────────────────────────────

// ─── Navigation ──────────────────────────────────────────────────────────────




// ─── Sample Data ──────────────────────────────────────────────────────────────


// ─── Utility components ───────────────────────────────────────────────────────











