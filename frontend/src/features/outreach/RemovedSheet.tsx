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
  const [blockCompany, setBlockCompany] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const detectedCount = pasteText.split('\n').map(line => line.trim()).filter(Boolean).length

  const submitPaste = async () => {
    if (!detectedCount) return
    setSubmitting(true)
    try {
      const res = await api.post('/leads/removed/bulk', {
        text: pasteText,
        reason: blockCompany ? 'Added from Removed Sheet (Company Block)' : 'Added from Removed Sheet',
        blockCompany,
      })
      const matched = (res.data.data || []).filter((r: any) => r.company_name || r.contact_name).length
      if (blockCompany) {
        toast(`${detectedCount} ${detectedCount === 1 ? 'entry' : 'entries'} processed — matched companies and all associated customers removed and blocked.`, 'success')
      } else {
        toast(`${detectedCount} ${detectedCount === 1 ? 'entry' : 'entries'} suppressed — ${matched} matched an existing CRM contact.`, 'success')
      }
      setPasteText('')
      setBlockCompany(false)
      setShowPaste(false)
      setRevision(r => r + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message ?? 'Could not process the pasted list.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestore = async (row: any) => {
    const label = row.contact ? `${row.contact} (${row.co || 'Company'})` : (row.co || row.email || row.phone || 'this entry')
    const { confirmed } = await askConfirm({
      title: 'Restore Removed Record',
      message: `Are you sure you want to restore ${label}? They will be unblocked and restored back to their active pipeline stage.`,
      confirmLabel: 'Restore Record',
    })
    if (!confirmed) return

    try {
      await api.post(`/leads/removed/${row.id}/restore`)
      toast(`${label} has been restored back to active pipeline.`, 'success')
      setSelected(prev => prev.filter(id => id !== row.id))
      setRevision(r => r + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message ?? 'Could not restore record.', 'error')
    }
  }

  const handleBulkRestore = async () => {
    if (!selected.length) return
    const count = selected.length
    const { confirmed } = await askConfirm({
      title: 'Restore Selected Records',
      message: `Are you sure you want to restore ${count} selected record${count === 1 ? '' : 's'}? They will be unblocked and restored back to their active pipeline stage.`,
      confirmLabel: `Restore ${count} Record${count === 1 ? '' : 's'}`,
    })
    if (!confirmed) return

    try {
      const results = await Promise.allSettled(
        selected.map(id => api.post(`/leads/removed/${id}/restore`))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) {
        toast(`${count - failed} records restored, ${failed} failed.`, 'error')
      } else {
        toast(`${count} record${count === 1 ? '' : 's'} restored back to active pipeline.`, 'success')
      }
      setSelected([])
      setRevision(r => r + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message ?? 'Could not restore records.', 'error')
    }
  }

  useEffect(() => {
    api.get('/leads/removed').then(response => {
      if (response.data.success) setData((response.data.data || []).map((row: any) => ({
        id: row.id,
        date: new Date(row.created_at).toLocaleDateString(),
        type: row.identity_type,
        phone: row.contacts?.phone_direct || row.contacts?.phone_2 || (row.identity_type === 'phone' ? row.normalized_value : ''),
        email: row.contacts?.email_active || row.contacts?.email_2 || (row.identity_type === 'email' ? row.normalized_value : ''),
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
  const [typeFilter, setTypeFilter] = useState<'' | 'phone' | 'email' | 'company' | 'contact'>('')
  const filtered = data.filter(row => {
    const term = search.trim().toLowerCase()
    const typeMatch = !typeFilter || row.type === typeFilter
    const searchMatch = !term || [row.co, row.contact, row.phone, row.email, row.reason]
      .some(value => String(value || '').toLowerCase().includes(term))
    return typeMatch && searchMatch
  })
  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 20px', background: '#FFF1F2', borderBottom: '1px solid #FECDD3', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Ic n={I.warning} size={15} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9F1239' }}>All records here are excluded from call, text, and email outreach automatically.</span>
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search removed records, company, contact, reason…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="">All Types</option>
          <option value="company">Company Block</option>
          <option value="contact">Contact Opt-Out</option>
          <option value="phone">Phone Only</option>
          <option value="email">Email Only</option>
        </select>
        {selected.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--brand-bg)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
            <span>{selected.length} selected</span>
            <Btn variant="ghost" sm onClick={handleBulkRestore} title="Restore selected records back to active pipeline">
              <Ic n={I.sync} size={13} /> Restore Selected
            </Btn>
            <Btn variant="ghost" sm onClick={() => setSelected([])}>
              Clear
            </Btn>
          </div>
        )}
        <div className="toolbar-right">
          <Btn variant="danger" sm onClick={() => setShowPaste(true)}><Ic n={I.plus} size={13} /> Paste Opted-Out / Bounced</Btn>
          <ExportMenu data={data} filename="removed" />
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th style={{ width: 44, textAlign: 'center' }}>
              <input
                type="checkbox"
                className="cb"
                checked={allFilteredSelected}
                onChange={e => {
                  if (e.target.checked) {
                    setSelected(Array.from(new Set([...selected, ...filtered.map(r => r.id)])))
                  } else {
                    const filteredIds = new Set(filtered.map(r => r.id))
                    setSelected(selected.filter(id => !filteredIds.has(id)))
                  }
                }}
              />
            </th>
            <th>Date</th><th>Removal Type</th><th>Phone</th><th>Email</th>
            <th>Company</th><th>Contact</th><th>Reason</th><th>Channel</th>
            <th>Prev Status</th><th>Curr Status</th><th>Added By</th>
            <th style={{ width: 90, textAlign: 'center' }}>Action</th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id || i} style={{ background: 'var(--red-bg)' }}>
                <td style={{ textAlign: 'center', width: 44 }}>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={selected.includes(r.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelected(prev => [...prev, r.id])
                      } else {
                        setSelected(prev => prev.filter(id => id !== r.id))
                      }
                    }}
                  />
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{r.date}</td>
                <td><span className={r.type === 'company' ? 'badge b-amber' : 'badge b-red'}>{r.type === 'company' ? 'Company Block' : r.type === 'contact' ? 'Contact' : r.type}</span></td>
                <td className="mono" style={{ fontSize: 12, color: r.phone ? 'var(--t2)' : 'var(--t4)' }}>{r.phone || '—'}</td>
                <td className="mono" style={{ fontSize: 12, color: r.email ? 'var(--t2)' : 'var(--t4)' }}>{r.email || '—'}</td>
                <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.co || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{r.contact || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                <td style={{ fontSize: 12 }}>{r.channel}</td>
                <td><Badge status={r.prevStatus as BadgeStatus} /></td>
                <td><Badge status={r.currStatus as BadgeStatus} /></td>
                <td style={{ fontSize: 12, color: 'var(--t3)' }}>{r.by}</td>
                <td style={{ textAlign: 'center' }}>
                  <Btn variant="ghost" sm onClick={() => handleRestore(r)} title="Restore back to active pipeline">
                    <Ic n={I.sync} size={13} /> Restore
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPaste && (
        <div className="overlay" onClick={() => setShowPaste(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Paste Opted-Out Contacts & Companies</div>
              <Btn variant="ghost" sm onClick={() => setShowPaste(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Paste phone numbers, email addresses, or company names (one per line). The system will find and update matching CRM records.</p>
              <textarea
                className="inp"
                rows={8}
                autoFocus
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'+1-206-555-0088\nbounce@example.com\nAcme Industrial Corp\n+1-701-555-0341'}
                style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}
              />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'}</div>

              <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--border-s)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={blockCompany}
                    onChange={e => setBlockCompany(e.target.checked)}
                    style={{ accentColor: 'var(--red)', width: 16, height: 16, marginTop: 2, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Remove all customers on same company</div>
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>
                      If checked, any company matched from the pasted details will have all associated customers, contacts, and pipeline records removed and blocked from outreach.
                    </div>
                  </div>
                </label>
              </div>
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

// ─── Deliverability ───────────────────────────────────────────────────────────

export default RemovedSheet
