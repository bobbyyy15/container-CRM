import axios from 'axios'
import { supabase } from '../config/supabase'
import { toast } from './notify'
import { broadcastCrmChange } from './realtime'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15_000,
})

api.interceptors.request.use(async config => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

let lastNetworkToastTime = 0
const notifyNetworkIssue = (msg: string, type: 'error' | 'info' = 'error') => {
  const now = Date.now()
  if (now - lastNetworkToastTime > 4000) {
    lastNetworkToastTime = now
    toast(msg, type)
  }
}

api.interceptors.response.use(
  response => {
    // Automatically trigger table auto-refresh on successful mutations
    const method = (response.config.method || 'get').toLowerCase()
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      const url = response.config.url || ''
      if (!url.startsWith('/auth') && !url.startsWith('/export') && !url.startsWith('http')) {
        if (url.includes('/leads') || url.includes('/companies') || url.includes('/contacts') || url.includes('/data/imports')) {
          broadcastCrmChange('leads', method.toUpperCase())
        }
        if (url.includes('/deals')) {
          broadcastCrmChange('deals', method.toUpperCase())
          if (url.includes('convert-to-sale') || url.includes('quotation')) {
            broadcastCrmChange('leads', method.toUpperCase())
          }
        }
        if (url.includes('/contracts')) {
          broadcastCrmChange('contracts', method.toUpperCase())
          broadcastCrmChange('inventory', method.toUpperCase())
          broadcastCrmChange('deals', method.toUpperCase())
        }
        if (url.includes('/inventory')) {
          broadcastCrmChange('inventory', method.toUpperCase())
        }
        if (url.includes('/customers')) {
          broadcastCrmChange('deals', method.toUpperCase())
          broadcastCrmChange('contracts', method.toUpperCase())
        }
        if (url.includes('/pics')) {
          broadcastCrmChange('leads', method.toUpperCase())
        }
        if (url.includes('/notifications')) {
          broadcastCrmChange('notifications', method.toUpperCase())
        }
      }
    }
    return response
  },
  async error => {
    const originalRequest = error.config

    // 1. Connection timeout or network drop
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      notifyNetworkIssue('Connection timed out. Slow network detected, please try again.', 'error')
      return Promise.reject(error)
    }
    if (error.code === 'ERR_NETWORK' || !error.response) {
      notifyNetworkIssue('Unable to reach server. Please check your internet connection.', 'error')
      return Promise.reject(error)
    }

    // 2. Token refresh & session expiry handling
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
        if (session?.access_token && !refreshError) {
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`
          return api(originalRequest)
        }
      } catch {
        // Refresh failed
      }

      notifyNetworkIssue('Your session has expired. Please sign in again.', 'info')
      supabase.auth.signOut().catch(() => {})
      return Promise.reject(error)
    }

    // 3. Rate limiting / concurrency throttle
    if (error.response?.status === 429) {
      notifyNetworkIssue('Too many requests. Please slow down and try again in a moment.', 'error')
    }

    return Promise.reject(error)
  }
)
