import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import type { RemovedMatchRow } from '../../app/types'

const Deliverability = () => {
  const [tab, setTab] = useState('Email')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<RemovedMatchRow[]>([])
  const [error, setError] = useState('')

  const detectedCount = pasteText.split('\n').map(l => l.trim()).filter(Boolean).length

  const submitPaste = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post('/leads/removed/bulk', { text: pasteText, reason: `Bulk paste from Deliverability (${tab})` })
      setResults(res.data.data || [])
      setPasteText('')
      setShowPaste(false)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.message ?? 'Could not process the pasted list.')
    } finally {
      setSubmitting(false)
    }
  }

  const visibleResults = tab === 'Unmatched'
    ? results.filter(r => !r.company_name && !r.contact_name)
    : tab === 'Phone / SMS'
      ? results.filter(r => r.identity_type === 'phone')
      : tab === 'Email'
        ? results.filter(r => r.identity_type === 'email')
        : results

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tabs">
        {['Email', 'Phone / SMS', 'Unmatched'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste {tab === 'Phone / SMS' ? 'Failed Numbers' : 'Bounced Emails'}</Btn>
        <div style={{ padding: '6px 12px', background: 'var(--s2)', borderRadius: 8, fontSize: 12, color: 'var(--t3)' }}>
          Paste one email or phone number per line. Each one is matched against existing contacts and added to the shared suppression list -- it's then filtered out of every prospect/warm-lead/inquiry list automatically.
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-s)', fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>
            Processing Results {results.length > 0 && <span style={{ color: 'var(--t4)', fontWeight: 500 }}>({visibleResults.length} of {results.length})</span>}
          </div>
          <table className="crm">
            <thead><tr><th>Pasted Value</th><th>Matched Company</th><th>Contact</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {visibleResults.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 12 }}>{r.raw_value}</td>
                  <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.company_name || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                  <td style={{ fontSize: 12.5 }}>{r.contact_name || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                  <td><span className="badge b-blue">{r.identity_type}</span></td>
                  <td>
                    {r.was_new
                      ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)' }}>Added to Removed list</span>
                      : <span style={{ fontSize: 12.5, color: 'var(--t4)' }}>Already suppressed</span>}
                  </td>
                </tr>
              ))}
              {visibleResults.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>
                  {results.length === 0 ? 'Paste a list to get started.' : 'Nothing in this tab yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rules legend */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
            {tab === 'Email' ? 'Email Deliverability Rules' : 'SMS & Phone Deliverability Rules'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(tab === 'Email' ? [
              { from: 'Hard Bounce', to: 'Removed', color: 'var(--red)' },
              { from: 'Recipient Not Found', to: 'Removed', color: 'var(--red)' },
              { from: 'Unsubscribed', to: 'Removed', color: 'var(--red)' },
              { from: 'Spam Complaint', to: 'Removed', color: 'var(--red)' },
              { from: 'Soft Bounce', to: 'Mail Delivery Report + Warning', color: 'var(--amber)' },
              { from: 'Mailbox Full', to: 'Mail Delivery Report + Warning', color: 'var(--amber)' },
            ] : [
              { from: 'Opted Out', to: 'Removed', color: 'var(--red)' },
              { from: 'Invalid Number', to: 'Removed', color: 'var(--red)' },
              { from: 'Landline', to: 'Calls Only', color: 'var(--brand)' },
              { from: 'SMS Undeliverable + Calls Work', to: 'Calls Only', color: 'var(--brand)' },
              { from: 'Calls & SMS Work', to: 'Call/Text', color: 'var(--green)' },
            ]).map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: 'var(--s2)', borderRadius: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--t3)', flex: 1 }}>{rule.from}</span>
                <Ic n={I.arrowRight} size={12} style={{ color: 'var(--border)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: rule.color }}>{rule.to}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showPaste && (
        <div className="overlay" onClick={() => !submitting && setShowPaste(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Paste {tab === 'Phone / SMS' ? 'Failed Numbers' : 'Bounced Emails'}</div>
              <Btn variant="ghost" sm onClick={() => setShowPaste(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Paste phone numbers or email addresses (one per line). Matching CRM contacts are found automatically and added to the shared suppression list.</p>
              {error && <div style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
              <textarea
                className="inp"
                rows={8}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'+1-206-555-0088\nbounce@example.com\n+1-701-555-0341'}
                style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}
              />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'}</div>
            </div>
            <div className="modal-footer">
              <Btn variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Btn>
              <button className="btn btn-danger" disabled={submitting || detectedCount === 0} onClick={submitPaste}>
                {submitting ? 'Matching…' : 'Match & Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default Deliverability
