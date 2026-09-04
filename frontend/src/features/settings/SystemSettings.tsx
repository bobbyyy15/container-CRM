import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import type { GoogleConnectionStatus, PicPerformanceRow } from '../../app/types'
import { useAnalytics } from '../../hooks/useAnalytics'

const SystemSettings = ({ onNav }: { onNav?: (s: Screen) => void }) => {
  const analytics = useAnalytics()
  const PIC_DATA: PicPerformanceRow[] = analytics?.charts?.PIC_DATA || []
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [callbackStatus] = useState(() => new URLSearchParams(window.location.search).get('google_sync'))

  const loadGoogleStatus = useCallback(async () => {
    try {
      const response = await api.get('/auth/google/status')
      setGoogleStatus(response.data.data)
      setGoogleError('')
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to load the Gmail connection status.')
    }
  }, [])

  useEffect(() => {
    loadGoogleStatus()
    if (callbackStatus) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [callbackStatus, loadGoogleStatus])

  const connectGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError('')
    try {
      const response = await api.get('/auth/google')
      window.location.assign(response.data.data.url)
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to start Google authorization.')
      setGoogleBusy(false)
    }
  }

  const disconnectGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError('')
    try {
      await api.delete('/auth/google')
      await loadGoogleStatus()
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to disconnect the Google account.')
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
  <div className="page-scroll">
    <div className="page-content" style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">System Settings</div>
        <div className="page-desc">Integrations, numbering formats, and system configuration.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Integrations */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Integrations</div>
          {callbackStatus === 'success' && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 12 }}>
              Gmail connected successfully.
            </div>
          )}
          {callbackStatus === 'cancelled' && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--amber-bg)', color: 'var(--amber-text)', fontSize: 12 }}>
              Google authorization was cancelled.
            </div>
          )}
          {googleError && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 12 }}>
              {googleError}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-s)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
              <Ic n={I.mail} size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Gmail Outreach</div>
              <div style={{ fontSize: 12, color: 'var(--t4)' }}>
                {!googleStatus
                  ? 'Checking connection...'
                  : !googleStatus.configured
                    ? 'Google OAuth credentials are not configured on the backend.'
                    : googleStatus.connected
                      ? `Connected as ${googleStatus.email}`
                      : 'Connect a Google account to send approved prospect outreach.'}
              </div>
            </div>
            {googleStatus?.connected ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={googleBusy} onClick={disconnectGoogle}>Disconnect</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" disabled={googleBusy || !googleStatus?.configured} onClick={connectGoogle}>
                {googleBusy ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
          {[
            { name: 'Google Sheets API', status: 'Planned', desc: 'Bidirectional synchronization is not implemented yet', color: 'var(--t4)' },
            { name: 'RingCentral', status: 'Planned', desc: 'Phone and SMS integration is not implemented yet', color: 'var(--t4)' },
            { name: 'Excel / CSV Import', status: 'Available', desc: 'Manual import via upload or paste', color: 'var(--brand)' },
          ].map(i => (
            <div key={i.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${i.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i.color }}>
                <Ic n={I.sync} size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i.name}</div>
                <div style={{ fontSize: 12, color: 'var(--t4)' }}>{i.desc}</div>
              </div>
              <span className={`badge ${i.status === 'Connected' ? 'b-green' : 'b-blue'}`}>{i.status}</span>
            </div>
          ))}
        </div>

        {/* Sales Reps */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Top Sales Representatives</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>By profit this month. Manage PIC identities and roles in User Management.</div>
            </div>
            <Btn variant="primary" sm onClick={() => onNav?.('user-management')}><Ic n={I.plus} size={13} /> Manage PICs</Btn>
          </div>
          {PIC_DATA.map((p, i) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div className="avatar" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 12, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i % 4], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i % 4] }}>{p.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{p.sales} sales · ${p.profit.toLocaleString()} profit this month</div>
              </div>
            </div>
          ))}
          {PIC_DATA.length === 0 && (
            <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No sales recorded yet this period.</div>
          )}
        </div>
      </div>
    </div>
  </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default SystemSettings
