import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { exportToCSV } from '../../lib/exporters'

const RemovedSheet = () => {
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [search, setSearch] = useState('')

  const detectedCount = pasteText.split('\n').map(line => line.trim()).filter(Boolean).length

  const submitPaste = async () => {
    if (!detectedCount) return
    setSubmitting(true)
    try {
      const res = await api.post('/leads/removed/bulk', { text: pasteText, reason: 'Added from Removed Sheet' })
      const matched = (res.data.data || []).filter((r: any) => r.company_name || r.contact_name).length
      toast(`${detectedCount} ${detectedCount === 1 ? 'entry' : 'entries'} suppressed — ${matched} matched an existing CRM contact.`, 'success')
      setPasteText('')
      setShowPaste(false)
      setRevision(r => r + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message ?? 'Could not process the pasted list.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    api.get('/leads/removed').then(response => {
      if (response.data.success) setData((response.data.data || []).map((row: any) => ({
        id: row.id,
        date: new Date(row.created_at).toLocaleDateString(),
        type: row.identity_type,
        phone: row.identity_type === 'phone' ? row.normalized_value : row.contacts?.phone_direct || row.contacts?.phone_2 || '',
        email: row.identity_type === 'email' ? row.normalized_value : row.contacts?.email_active || row.contacts?.email_2 || '',
        co: row.companies?.name || '',
        contact: `${row.contacts?.first_name || ''} ${row.contacts?.last_name || ''}`.trim(),
        reason: row.reason,
        channel: row.source,
        by: row.profiles?.full_name || row.profiles?.email || 'System',
        prevStatus: 'Proceed',
        currStatus: 'Removed',
      })))
    }).catch(console.error)
  }, [revision])
  const [typeFilter, setTypeFilter] = useState<'' | 'phone' | 'email'>('')
  const filtered = data.filter(row => {
    const term = search.trim().toLowerCase()
    const typeMatch = !typeFilter || row.type === typeFilter
    const searchMatch = !term || [row.co, row.contact, row.phone, row.email, row.reason]
      .some(value => String(value || '').toLowerCase().includes(term))
    return typeMatch && searchMatch
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 20px', background: '#FFF1F2', borderBottom: '1px solid #FECDD3', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Ic n={I.warning} size={15} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9F1239' }}>All records here are excluded from call, text, and email outreach automatically.</span>
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search removed records, or reason…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="">All Types</option>
          <option value="phone">Phone Only</option>
          <option value="email">Email Only</option>
        </select>
        <div className="toolbar-right">
          <Btn variant="danger" sm onClick={() => setShowPaste(true)}><Ic n={I.plus} size={13} /> Paste Opted-Out / Bounced</Btn>
          <ExportMenu data={data} filename="removed" />
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Date</th><th>Removal Type</th><th>Phone</th><th>Email</th>
            <th>Company</th><th>Contact</th><th>Reason</th><th>Channel</th>
            <th>Prev Status</th><th>Curr Status</th><th>Added By</th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id || i} style={{ background: 'var(--red-bg)' }}>
                <td className="mono" style={{ fontSize: 12 }}>{r.date}</td>
                <td><span className="badge b-red">{r.type}</span></td>
                <td className="mono" style={{ fontSize: 12, color: r.phone ? 'var(--t2)' : 'var(--t4)' }}>{r.phone || '—'}</td>
                <td className="mono" style={{ fontSize: 12, color: r.email ? 'var(--t2)' : 'var(--t4)' }}>{r.email || '—'}</td>
                <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.co}</td>
                <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                <td style={{ fontSize: 12 }}>{r.channel}</td>
                <td><Badge status={r.prevStatus as BadgeStatus} /></td>
                <td><Badge status={r.currStatus as BadgeStatus} /></td>
                <td style={{ fontSize: 12, color: 'var(--t3)' }}>{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPaste && (
        <div className="overlay" onClick={() => setShowPaste(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Paste Opted-Out Contacts</div>
              <Btn variant="ghost" sm onClick={() => setShowPaste(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Paste phone numbers or email addresses (one per line). The system will find and update matching CRM records.</p>
              <textarea className="inp" rows={8} autoFocus value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'+1-206-555-0088\nbounce@example.com\n+1-701-555-0341'} style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }} />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'}</div>
            </div>
            <div className="modal-footer">
              <Btn variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={submitPaste} disabled={submitting || !detectedCount}>{submitting ? 'Removing…' : 'Match & Remove'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default RemovedSheet
