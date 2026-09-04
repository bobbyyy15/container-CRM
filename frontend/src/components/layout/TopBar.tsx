import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { supabase } from '../../config/supabase'
import { useRealtimeStatus } from '../../lib/realtime'
import { Ic, I } from '../ui/icons'
import { useNotifications } from '../../hooks/useNotifications'
import type { Screen } from '../../app/types'

const NOTIFICATION_STYLE: Record<string, { icon: string; color: string }> = {
  inquiry_pending_validation: { icon: I.inquiry, color: 'var(--amber)' },
  inquiry_approved: { icon: I.check, color: 'var(--green)' },
  inquiry_rejected: { icon: I.x, color: 'var(--red)' },
}

const TopBar = ({ isDark, onToggleDark, session, onNav, role }: { isDark: boolean; onToggleDark: () => void; session: any; onNav: (s: Screen) => void; role?: string }) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const realtimeStatus = useRealtimeStatus()
  const syncText = realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'connecting' ? 'Connecting…' : 'Offline'
  const userName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User'
  const initials = userName.substring(0, 2).toUpperCase()
  
  const { notifications, unread, refresh } = useNotifications()
  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }
  const markRead = (id: string) => api.patch(`/notifications/${id}/read`).then(refresh).catch(console.error)
  const markAllRead = () => api.patch('/notifications/read-all').then(refresh).catch(console.error)

  // Global search: hits the same search-capable endpoints the individual list screens
  // already use, and jumps to the right screen on click. It doesn't deep-link to the
  // exact record (that screen's own search box isn't pre-filled), only to the section --
  // still a real result, just not a full jump-to-record.
  const [gsQuery, setGsQuery] = useState('')
  const [gsResults, setGsResults] = useState<{ label: string; sub: string; screen: Screen }[]>([])
  const [gsOpen, setGsOpen] = useState(false)
  const [gsLoading, setGsLoading] = useState(false)
  useEffect(() => {
    const term = gsQuery.trim()
    if (term.length < 2) { setGsResults([]); return }
    setGsLoading(true)
    // Clearing the timeout alone did not cancel requests already in flight, so a slow
    // response for "abc" could resolve after "abcd" and overwrite the newer results --
    // and its setGsLoading(false) cleared the spinner while the newer batch was still
    // running. Abort the previous batch and ignore anything that still resolves.
    const controller = new AbortController()
    let cancelled = false
    const handle = setTimeout(() => {
      const opts = (search: string) => ({ params: { search, limit: 5 }, signal: controller.signal })
      Promise.all([
        api.get('/leads/prospects', opts(term)).catch(() => ({ data: { data: [] } })),
        api.get('/leads/warm-leads', opts(term)).catch(() => ({ data: { data: [] } })),
        api.get('/leads/inquiries', opts(term)).catch(() => ({ data: { data: [] } })),
        api.get('/customers', opts(term)).catch(() => ({ data: { data: [] } })),
      ]).then(([prospects, warmLeads, inquiries, customers]) => {
        if (cancelled) return
        const rows: { label: string; sub: string; screen: Screen }[] = [
          ...(prospects.data.data || []).map((r: any) => ({ label: r.companies?.name || r.contacts?.first_name || 'Prospect', sub: 'Prospect Client', screen: 'prospects' as Screen })),
          ...(warmLeads.data.data || []).map((r: any) => ({ label: r.companies?.name || r.contacts?.first_name || 'Warm Lead', sub: 'Warm Lead', screen: 'warm-leads' as Screen })),
          ...(inquiries.data.data || []).map((r: any) => ({ label: r.companies?.name || 'Inquiry', sub: `Inquiry — ${r.status || ''}`, screen: 'inquiries' as Screen })),
          ...(customers.data.data || []).map((r: any) => ({ label: r.company_name || 'Customer', sub: 'Customer Account', screen: 'customers' as Screen })),
        ]
        setGsResults(rows)
        setGsLoading(false)
      }).catch(() => { if (!cancelled) setGsLoading(false) })
    }, 300)
    return () => { cancelled = true; controller.abort(); clearTimeout(handle) }
  }, [gsQuery])

  return (
    <header className="topbar">
      <div className="search-wrap" style={{ position: 'relative' }}>
        <Ic n={I.search} size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)' }} />
        <input
          placeholder="Search prospects, leads, inquiries, customers…"
          value={gsQuery}
          onChange={e => { setGsQuery(e.target.value); setGsOpen(true) }}
          onFocus={() => setGsOpen(true)}
          onBlur={() => setTimeout(() => setGsOpen(false), 150)}
        />
        {gsOpen && gsQuery.trim().length >= 2 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 200, maxHeight: 320, overflowY: 'auto' }}>
            {gsLoading ? (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--t4)' }}>Searching…</div>
            ) : gsResults.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--t4)' }}>No matches for "{gsQuery}".</div>
            ) : (
              gsResults.map((r, i) => (
                <div
                  key={i}
                  onClick={() => { onNav(r.screen); setGsOpen(false); setGsQuery('') }}
                  style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: i < gsResults.length - 1 ? '1px solid var(--border-s)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{r.sub}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="sync-pill" data-status={realtimeStatus} title="Realtime connection status">
          <span className="sync-dot" />
          {syncText}
        </div>

        <button className="tb-btn" onClick={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Ic n={isDark ? I.sun : I.moon} size={16} />
        </button>

        <div style={{ position: 'relative' }}>
          {showNotifs && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifs(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: -50, width: 320, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Notifications</div>
                  {unread > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', cursor: 'pointer' }} onClick={markAllRead}>Mark all as read</div>}
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--t3)', fontSize: 12.5 }}>
                      <Ic n={I.bell} size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div>You have no new notifications.</div>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const style = NOTIFICATION_STYLE[n.type] || { icon: I.bell, color: 'var(--brand)' }
                      return (
                        <div key={n.id} onClick={() => !n.read && markRead(n.id)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 12, cursor: n.read ? 'default' : 'pointer', background: !n.read ? 'rgba(49, 94, 246, 0.03)' : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = !n.read ? 'rgba(49, 94, 246, 0.03)' : 'transparent'}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${style.color}15`, color: style.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ic n={style.icon} size={14} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: !n.read ? 700 : 600, color: 'var(--t1)' }}>{n.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--t4)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{n.message}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
          <button className="tb-btn" onClick={() => setShowNotifs(!showNotifs)} title="Notifications" aria-label="Notifications">
            <Ic n={I.bell} size={17} />
            {unread > 0 && <span className="notif-dot" />}
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          {showAccountMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowAccountMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 220, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 0', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-s)', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{userName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{session?.user?.email}</div>
                </div>
                
                <div style={{ padding: '4px' }}>
                  <div onClick={() => { onNav('profile-settings'); setShowAccountMenu(false); }} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Ic n={I.customer} size={14} style={{ color: 'var(--t3)' }} />
                    My Profile
                  </div>
                  <div onClick={() => { onNav('system-settings'); setShowAccountMenu(false); }} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Ic n={I.config} size={14} style={{ color: 'var(--t3)' }} />
                    System Settings
                  </div>
                  <div onClick={() => supabase.auth.signOut()} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--red-light, #FEE2E2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Logout
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="avatar-btn" onClick={() => setShowAccountMenu(!showAccountMenu)} style={{ cursor: 'pointer' }}>
            <div className="avatar">{initials}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.2 }}>{userName}</span>
              <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'capitalize' }}>
                {role ? role.replace('_', ' ') : 'Staff'}
              </span>
            </div>
            <Ic n={I.chevDown} size={12} style={{ color: 'var(--t4)', marginLeft: 2 }} />
          </div>
        </div>
      </div>
    </header>
  )
}


export default TopBar
