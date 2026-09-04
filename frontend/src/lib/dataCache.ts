import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from './api'

type CacheEntry<T> = {
  data: T
  timestamp: number
}

const memoryCache = new Map<string, CacheEntry<any>>()
const inFlightRequests = new Map<string, Promise<any>>()

/**
 * Executes a fetcher with request deduplication and in-memory caching.
 */
export const fetchCached = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 60_000
): Promise<T> => {
  const cached = memoryCache.get(key)
  const now = Date.now()

  // Return fresh cached data if within TTL
  if (cached && (now - cached.timestamp < ttlMs)) {
    return cached.data
  }

  // Deduplicate in-flight requests
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>
  }

  const promise = fetcher()
    .then(data => {
      memoryCache.set(key, { data, timestamp: Date.now() })
      inFlightRequests.delete(key)
      return data
    })
    .catch(err => {
      inFlightRequests.delete(key)
      throw err
    })

  inFlightRequests.set(key, promise)
  return promise
}

/**
 * Get immediately from cache if available
 */
export const getFromCache = <T>(key: string): T | undefined => {
  return memoryCache.get(key)?.data
}

/**
 * Invalidate a specific cache key or all keys matching a prefix
 */
export const invalidateCache = (keyPrefix?: string) => {
  if (!keyPrefix) {
    memoryCache.clear()
    return
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key)
    }
  }
}

/**
 * Custom hook implementing Stale-While-Revalidate (SWR) caching for 0ms loads.
 */
export const useCachedData = <T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: any[] = [],
  enabled: boolean = true,
  fallbackValue: T = [] as any
): { data: T; loading: boolean; refresh: () => Promise<void> } => {
  const initial = memoryCache.get(key)?.data ?? fallbackValue
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState<boolean>(!memoryCache.has(key))
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const executeFetch = useCallback(async (bypassTtl = false) => {
    if (!enabled) return

    const cached = memoryCache.get(key)
    if (cached && !bypassTtl) {
      setData(cached.data)
      setLoading(false)
    }

    try {
      // In-flight dedup fetcher
      const fetchPromise = inFlightRequests.get(key) || fetcher()
      if (!inFlightRequests.has(key)) inFlightRequests.set(key, fetchPromise)

      const freshData = await fetchPromise
      inFlightRequests.delete(key)

      memoryCache.set(key, { data: freshData, timestamp: Date.now() })

      if (isMounted.current) {
        setData(freshData)
        setLoading(false)
      }
    } catch (err) {
      inFlightRequests.delete(key)
      if (isMounted.current) {
        setLoading(false)
      }
      console.error(`Error fetching data for ${key}:`, err)
    }
  }, [key, enabled, ...deps])

  useEffect(() => {
    // If we have cached data for this key, set it immediately
    const cached = memoryCache.get(key)
    if (cached) {
      setData(cached.data)
      setLoading(false)
    } else {
      setLoading(true)
    }
    executeFetch(false)
  }, [executeFetch])

  const refresh = useCallback(async () => {
    await executeFetch(true)
  }, [executeFetch])

  return { data, loading, refresh }
}

/**
 * Preloads all common CRM views in the background to ensure instant tab switching.
 */
export const preloadAppData = () => {
  // Run during idle time so it never blocks UI rendering
  const runPreload = () => {
    const endpoints = [
      { key: 'leads:prospects:active', url: '/leads/prospects?limit=500&status=active' },
      { key: 'leads:warm-leads:active', url: '/leads/warm-leads?limit=500' },
      { key: 'leads:inquiries:active', url: '/leads/inquiries?limit=500&status=active' },
      { key: 'deals:quotations', url: '/deals/quotations' },
      { key: 'deals:sales', url: '/deals/sales' },
      { key: 'customers:default:all:All::all', url: '/customers?status=All&search=' },
      { key: 'customers:personal:all:All::all', url: '/customers?status=All&search=&scope=personal' },
      { key: 'customers:master:all:All::all', url: '/customers?status=All&search=&scope=master' },
      { key: 'customers:All::all', url: '/customers?status=All&search=' },
      { key: 'contracts:All Statuses:All Pickup Statuses:', url: '/contracts?status=All+Statuses&pickStatus=All+Pickup+Statuses&search=' },
      { key: 'inventory:{}', url: '/inventory' },
      { key: 'analytics:dashboard', url: '/analytics/dashboard' },
      { key: 'inventory:summary', url: '/inventory/summary' },
      { key: 'catalog:/catalog/sizes', url: '/catalog/sizes' },
      { key: 'catalog:/catalog/conditions', url: '/catalog/conditions' },
      { key: 'pics:all', url: '/pics' },
    ]

    for (const ep of endpoints) {
      if (!memoryCache.has(ep.key) && !inFlightRequests.has(ep.key)) {
        const promise = api.get(ep.url)
          .then(res => {
            const resultData = res.data.data ?? res.data
            memoryCache.set(ep.key, { data: resultData, timestamp: Date.now() })
            inFlightRequests.delete(ep.key)
            return resultData
          })
          .catch(() => {
            inFlightRequests.delete(ep.key)
          })
        inFlightRequests.set(ep.key, promise)
      }
    }
  }

  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      ;(window as any).requestIdleCallback(runPreload, { timeout: 2000 })
    } else {
      setTimeout(runPreload, 300)
    }
  }
}
