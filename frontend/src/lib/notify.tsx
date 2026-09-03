import { useEffect, useState } from 'react'

// Drop-in replacements for alert()/confirm()/window.prompt() -- those are unstyled, blocking
// OS dialogs that make an otherwise-normal app feel dated. Standalone module (not part of
// App.tsx) so Login.tsx / ResetPassword.tsx / other pre-app-shell screens can use it too
// without creating a circular import (App.tsx already imports those files).

const ICONS = {
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
}

const NIcon = ({ path, size = 14 }: { path: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
)

type ToastItem = { id: number; message: string; type: 'success' | 'error' | 'info' }
let toastListener: ((t: ToastItem) => void) | null = null
let toastSeq = 0

export const toast = (message: string, type: ToastItem['type'] = 'info') => {
  toastListener?.({ id: ++toastSeq, message, type })
}

export const ToastHost = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  useEffect(() => {
    toastListener = (t) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4500)
    }
    return () => { toastListener = null }
  }, [])
  const STYLE: Record<ToastItem['type'], { bg: string; color: string; icon: string }> = {
    success: { bg: 'var(--green)', color: 'white', icon: ICONS.check },
    error: { bg: 'var(--red)', color: 'white', icon: ICONS.x },
    info: { bg: 'var(--brand)', color: 'white', icon: ICONS.bell },
  }
  if (toasts.length === 0) return null
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 3000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      {toasts.map(t => {
        const s = STYLE[t.type]
        return (
          <div key={t.id} style={{ background: s.bg, color: s.color, borderRadius: 10, padding: '11px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, fontWeight: 500, animation: 'toast-in 0.2s ease' }}>
            <NIcon path={s.icon} size={15} />
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button aria-label="Dismiss notification" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
              <NIcon path={ICONS.x} size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

type ConfirmRequest = {
  id: number
  title: string
  message: string
  danger?: boolean
  needsReason?: boolean
  confirmLabel?: string
  defaultValue?: string
  resolve: (result: { confirmed: boolean; reason?: string }) => void
}
let confirmListener: ((r: ConfirmRequest) => void) | null = null
let confirmSeq = 0

// Drop-in async replacement for confirm('...') -- await it, check .confirmed.
export const askConfirm = (opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) =>
  new Promise<{ confirmed: boolean; reason?: string }>(resolve => {
    confirmListener?.({ id: ++confirmSeq, resolve, ...opts })
  })

// Drop-in async replacement for window.prompt('...') -- await it, check .confirmed, read .reason.
export const askReason = (opts: { title: string; message: string; confirmLabel?: string; defaultValue?: string }) =>
  new Promise<{ confirmed: boolean; reason?: string }>(resolve => {
    confirmListener?.({ id: ++confirmSeq, resolve, needsReason: true, ...opts })
  })

export const ConfirmHost = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [reasonText, setReasonText] = useState('')
  useEffect(() => {
    confirmListener = (r) => { setReasonText(r.defaultValue ?? ''); setRequest(r) }
    return () => { confirmListener = null }
  }, [])
  if (!request) return null
  const settle = (confirmed: boolean) => {
    request.resolve({ confirmed, reason: confirmed ? reasonText.trim() : undefined })
    setRequest(null)
  }
  return (
    <div className="overlay" onClick={() => settle(false)}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{request.title}</div>
          <button className="btn btn-ghost btn-sm" aria-label="Cancel" onClick={() => settle(false)}><NIcon path={ICONS.x} size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, margin: request.needsReason ? '0 0 12px' : 0 }}>{request.message}</p>
          {request.needsReason && (
            <textarea
              className="inp" rows={3} autoFocus
              style={{ height: 'auto', padding: '8px 12px' }}
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder="Reason…"
            />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => settle(false)}>Cancel</button>
          <button
            className={request.danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={request.needsReason && !reasonText.trim()}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
