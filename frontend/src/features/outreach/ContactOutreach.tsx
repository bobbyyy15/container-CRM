import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { EligDot } from '../../components/ui/primitives'
import { useProspects } from '../../hooks/useProspects'

const ContactOutreach = () => {
  const prospectsData = useProspects()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [emailRow, setEmailRow] = useState<any>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')

  const term = search.trim().toLowerCase()
  const filtered = prospectsData.filter(r =>
    !term || [r.company, r.contact, r.phone, r.emailAddr].some(value => String(value ?? '').toLowerCase().includes(term))
  )

  const withElig = filtered.map(r => ({
    ...r,
    callable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only'),
    textable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only'),
    emailable: r.cat === 'Proceed' && !!r.emailAddr,
  }))

  const allSelected = withElig.length > 0 && withElig.every(r => selected.includes(r.id))
  const toggleAll = () => setSelected(allSelected ? [] : withElig.map(r => r.id))
  const toggleOne = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Copying operates on the selection when one exists, otherwise every currently-filtered row
  // -- so the buttons are useful with or without an explicit selection.
  const activeRows = selected.length > 0 ? withElig.filter(r => selected.includes(r.id)) : withElig

  const handleCopy = (type: string, build: (r: typeof withElig[number]) => string | null, eligibleOf: (r: typeof withElig[number]) => boolean) => {
    const eligible = activeRows.filter(r => r.cat !== 'Removed' && eligibleOf(r))
    const lines = eligible.map(build).filter((v): v is string => !!v)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied(`${type}|${lines.length}|${activeRows.length - eligible.length}`)
    setTimeout(() => setCopied(''), 4000)
  }

  const [copyLabel, eligibleCount, excludedCount] = copied ? copied.split('|') : ['', '0', '0']

  const sendEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!emailRow) return
    setSendingEmail(true)
    setEmailError('')
    try {
      await api.post('/outreach/email', {
        prospectId: emailRow.id,
        to: emailRow.emailAddr,
        subject: emailSubject,
        body: emailBody.replace(/\n/g, '<br />'),
      })
      toast(`Email sent to ${emailRow.contact || emailRow.company}`, 'success')
      setEmailRow(null)
      setEmailSubject('')
      setEmailBody('')
    } catch (error: any) {
      setEmailError(error.response?.data?.error?.message ?? error.message ?? 'Email could not be sent.')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {emailRow && (
        <div className="overlay" role="presentation" onMouseDown={() => !sendingEmail && setEmailRow(null)}>
          <form className="modal outreach-compose" onSubmit={sendEmail} onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header"><div><div className="modal-title">Compose outreach email</div><div className="modal-desc">Sending through your connected Google account to {emailRow.emailAddr}.</div></div><button type="button" className="btn btn-ghost" onClick={() => setEmailRow(null)} aria-label="Close">×</button></div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              {emailError && <div style={{ padding: 10, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{emailError}</div>}
              <label><span className="form-label">Subject</span><input className="inp" required maxLength={200} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} /></label>
              <label><span className="form-label">Message</span><textarea className="inp" required rows={8} value={emailBody} onChange={e => setEmailBody(e.target.value)} /></label>
            </div>
            <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => setEmailRow(null)}>Cancel</button><button className="btn btn-primary" disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}>{sendingEmail ? 'Sending…' : 'Send email'}</button></div>
          </form>
        </div>
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Contact Outreach Sheet</div>
          <div className="page-desc">Select contacts (or leave none selected to use every row below) and copy for RingCentral, email, or SMS campaigns.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={() => handleCopy('Numbers', r => r.phone || null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy Numbers</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Emails', r => r.emailAddr || null, r => r.emailable)}><Ic n={I.copy} size={13} /> Copy Emails</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Name + Number', r => r.phone ? `${r.contact || r.company}\t${r.phone}` : null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy Name + Number</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Name + Email', r => r.emailAddr ? `${r.contact || r.company}\t${r.emailAddr}` : null, r => r.emailable)}><Ic n={I.copy} size={13} /> Copy Name + Email</Btn>
        </div>
      </div>

      {copied && (
        <div style={{ padding: '10px 20px', background: 'var(--green-bg)', borderBottom: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Ic n={I.check} size={14} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green-text)' }}>
            Copied "{copyLabel}" — {eligibleCount} eligible contact{eligibleCount === '1' ? '' : 's'} to clipboard. Excluded: {excludedCount} not eligible/removed.
          </span>
          <Btn variant="ghost" sm onClick={() => setCopied('')}><Ic n={I.x} size={13} /></Btn>
        </div>
      )}

      {/* Eligibility summary */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)', borderBottom: '1px solid var(--border-s)', flexShrink: 0 }}>
        {[
          { label: 'Call Eligible', val: withElig.filter(r => r.callable).length, color: 'var(--teal)' },
          { label: 'Text Eligible', val: withElig.filter(r => r.textable).length, color: 'var(--purple)' },
          { label: 'Email Eligible', val: withElig.filter(r => r.emailable).length, color: 'var(--brand)' },
          { label: 'Removed / Excluded', val: withElig.filter(r => r.cat === 'Removed').length, color: 'var(--red)' },
        ].map(e => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <strong style={{ color: e.color, fontFamily: 'var(--mono)' }}>{e.val}</strong> {e.label}
          </div>
        ))}
        {selected.length > 0 && <div style={{ marginLeft: 'auto', fontWeight: 600 }}>{selected.length} selected</div>}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="toolbar-right">
          <Btn variant="primary" sm style={{ background: '#1F2937' }} onClick={() => handleCopy('RingCentral Format', r => r.phone || null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy RingCentral Format</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" checked={allSelected} onChange={toggleAll} /></th>
            <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th>
            <th>City / State</th><th>PIC</th><th style={{ textAlign: 'center' }}>Call</th>
            <th style={{ textAlign: 'center' }}>Text</th><th style={{ textAlign: 'center' }}>Email</th><th className="col-actions">Action</th>
          </tr></thead>
          <tbody>
            {withElig.map(r => (
              <tr key={r.id} style={{ background: r.cat === 'Removed' ? 'var(--red-bg)' : undefined }}>
                <td className="col-check"><input type="checkbox" className="cb" checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} /></td>
                <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{r.company}</td>
                <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.phone}</td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--brand)' }}>{r.emailAddr || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>{r.city}, {r.state}</td>
                <td><ChipPIC label={r.pic} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.callable} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.textable} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.emailable} /></td>
                <td className="col-actions"><Btn variant="ghost" sm disabled={!r.emailable} onClick={() => { setEmailRow(r); setEmailError(''); }}>Compose</Btn></td>
              </tr>
            ))}
            {withElig.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>No contacts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


export default ContactOutreach
