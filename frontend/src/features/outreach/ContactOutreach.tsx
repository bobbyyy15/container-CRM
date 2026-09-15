import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import EmptyTableState from '../../components/ui/EmptyTableState'
import RefreshButton from '../../components/ui/RefreshButton'
import type { Screen, BadgeStatus } from '../../app/types'
import { EligDot } from '../../components/ui/primitives'
import { useProspects } from '../../hooks/useProspects'
import SuggestInput from '../../components/ui/SuggestInput'
import { usePics } from '../pipeline/PipelineDialogs'

type TemplateKey = 'cold_intro' | 'inventory_promo' | 'followup' | 'custom'

const TEMPLATES: { id: TemplateKey; label: string; desc: string }[] = [
  { id: 'cold_intro', label: 'Cold Introduction', desc: 'Standard supply inquiry & introductory outreach' },
  { id: 'inventory_promo', label: 'Inventory & Pricing', desc: 'Promote available container stock and quick dispatch' },
  { id: 'followup', label: 'Follow-Up / Check-In', desc: 'Follow up on previous container inquiry or pricing' },
  { id: 'custom', label: 'Custom Message (Blank)', desc: 'Write your own custom subject & body from scratch' },
]

const OFFERING_SUGGESTIONS = [
  '20ft & 40ft shipping containers',
  '20ft Standard Dry Van containers',
  '40ft High Cube (40HC) containers',
  '40ft Standard Dry Van containers',
  'Cargo Worthy (CW) certified containers',
  'Wind & Water Tight (WWT) containers',
  '10ft Storage containers',
  '45ft High Cube containers',
  'Refrigerated (Reefer) containers',
  'One-Trip / New condition containers',
  'Open Top & Flat Rack containers',
]

const OFFER_DETAILS_SUGGESTIONS = [
  'Depot-direct pricing with immediate release.',
  'Competitive wholesale rates and quick turnaround.',
  'Current discounted rates on surplus stock this week.',
  'Volume discount available on multi-unit orders.',
  'Immediate dispatch with crane or tilt-bed delivery available.',
  'Prompt pickup from local depot or direct-to-site delivery.',
  'Units are pre-inspected and ready for fast gate release.',
]

const COMMON_DEPOTS = [
  'Chicago, IL depot',
  'Houston, TX depot',
  'Los Angeles / Long Beach, CA',
  'Savannah, GA depot',
  'Dallas / Fort Worth, TX',
  'New York / New Jersey port area',
  'Atlanta, GA depot',
  'Seattle / Tacoma, WA',
  'Denver, CO depot',
  'Kansas City, MO depot',
  'your local area',
]

const TITLE_SUGGESTIONS = [
  'Container Sales Specialist',
  'Account Executive',
  'Sales Manager',
  'Equipment & Logistics Specialist',
  'Account Manager',
  'Commercial Sales Representative',
  'Regional Supply Representative',
]

const generateEmail = (
  tmpl: TemplateKey,
  params: {
    contact: string
    company: string
    location: string
    offering: string
    details: string
    sender: string
    title?: string
  }
) => {
  const greeting = params.contact ? `Hi ${params.contact},` : 'Hello,'
  const company = params.company || 'your team'
  const location = params.location || 'your area'
  const offering = params.offering || '20ft & 40ft shipping containers'
  const details = params.details ? `\n\n${params.details}` : ''
  const signoffName = params.sender || 'Sales Team'
  const signoffTitle = params.title?.trim() ? `\n${params.title.trim()}` : ''
  const signoff = `Best regards,\n${signoffName}${signoffTitle}`

  if (tmpl === 'cold_intro') {
    return {
      subject: `Container supply & availability for ${params.company || 'your projects'}`,
      body: `${greeting}

I hope this email finds you well.

I'm reaching out from our sales team regarding shipping container equipment and availability in ${location}. We currently have certified ${offering} ready for immediate dispatch and release.${details}

Would ${company} be open to a quick quote or having our current equipment and price sheet on hand for your upcoming container needs?

${signoff}`,
    }
  }

  if (tmpl === 'inventory_promo') {
    return {
      subject: `Available container inventory & depot rates — ${params.company || 'Direct Supply'}`,
      body: `${greeting}

We currently have available surplus inventory of ${offering} positioned near ${location}, ready for prompt pickup or direct delivery.${details}

All units are thoroughly inspected, wind & water tight (WWT) or cargo worthy (CW). Please let me know if you would like current depot pricing, photos, or a quick quote today.

${signoff}`,
    }
  }

  if (tmpl === 'followup') {
    return {
      subject: `Following up — Container equipment for ${params.company || 'your team'}`,
      body: `${greeting}

Just following up on my previous note regarding container equipment supply for ${company}.

We have newly released units of ${offering} available in ${location}.${details}

Please feel free to reply directly here if there is anything we can price out for you this week.

${signoff}`,
    }
  }

  return { subject: '', body: '' }
}

const ContactOutreach = () => {
  const pics = usePics()
  // The revision counter exists for the Refresh button -- useProspects re-fetches
  // when it changes, which a cache invalidation alone would not trigger.
  const [revision, setRevision] = useState(0)
  const prospectsData = useProspects(revision)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [emailRow, setEmailRow] = useState<any>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')

  // Template & fill-in details state
  const [templateKey, setTemplateKey] = useState<TemplateKey>('cold_intro')
  const [fieldContact, setFieldContact] = useState('')
  const [fieldCompany, setFieldCompany] = useState('')
  const [fieldLocation, setFieldLocation] = useState('')
  const [fieldOffering, setFieldOffering] = useState('20ft & 40ft shipping containers')
  const [fieldDetails, setFieldDetails] = useState('Depot-direct pricing with immediate release.')
  const [fieldSender, setFieldSender] = useState('Sales Team')
  const [fieldTitle, setFieldTitle] = useState('Container Sales Specialist')

  const locationSuggestions = React.useMemo(() => {
    const list = [...COMMON_DEPOTS]
    const currentLoc = [emailRow?.city, emailRow?.state].filter(Boolean).join(', ')
    if (currentLoc && !list.includes(currentLoc)) {
      list.unshift(currentLoc)
    }
    return list
  }, [emailRow])

  const senderSuggestions = React.useMemo(() => {
    const names = pics.map(p => p.name).filter(Boolean)
    const list = [...names, 'Sales Team', 'Container Equipment Desk']
    return Array.from(new Set(list))
  }, [pics])

  const handleOpenCompose = (row: any) => {
    const contact = row.contact || ''
    const company = row.company || ''
    const loc = [row.city, row.state].filter(Boolean).join(', ') || 'your area'
    const offering = '20ft & 40ft shipping containers'
    const details = 'Depot-direct pricing with immediate release.'
    const sender = row.pic || 'Sales Team'
    const title = fieldTitle || 'Container Sales Specialist'

    setFieldContact(contact)
    setFieldCompany(company)
    setFieldLocation(loc)
    setFieldOffering(offering)
    setFieldDetails(details)
    setFieldSender(sender)
    setFieldTitle(title)
    setTemplateKey('cold_intro')
    setEmailRow(row)
    setEmailError('')

    const generated = generateEmail('cold_intro', {
      contact,
      company,
      location: loc,
      offering,
      details,
      sender,
      title,
    })
    setEmailSubject(generated.subject)
    setEmailBody(generated.body)
  }

  const handleTemplateChange = (newTmpl: TemplateKey) => {
    setTemplateKey(newTmpl)
    if (newTmpl === 'custom') {
      setEmailSubject('')
      setEmailBody('')
    } else {
      const generated = generateEmail(newTmpl, {
        contact: fieldContact,
        company: fieldCompany,
        location: fieldLocation,
        offering: fieldOffering,
        details: fieldDetails,
        sender: fieldSender,
        title: fieldTitle,
      })
      setEmailSubject(generated.subject)
      setEmailBody(generated.body)
    }
  }

  const updateFieldAndApply = (updates: Partial<{
    contact: string
    company: string
    location: string
    offering: string
    details: string
    sender: string
    title: string
  }>) => {
    const nextContact = updates.contact !== undefined ? updates.contact : fieldContact
    const nextCompany = updates.company !== undefined ? updates.company : fieldCompany
    const nextLocation = updates.location !== undefined ? updates.location : fieldLocation
    const nextOffering = updates.offering !== undefined ? updates.offering : fieldOffering
    const nextDetails = updates.details !== undefined ? updates.details : fieldDetails
    const nextSender = updates.sender !== undefined ? updates.sender : fieldSender
    const nextTitle = updates.title !== undefined ? updates.title : fieldTitle

    if (updates.contact !== undefined) setFieldContact(updates.contact)
    if (updates.company !== undefined) setFieldCompany(updates.company)
    if (updates.location !== undefined) setFieldLocation(updates.location)
    if (updates.offering !== undefined) setFieldOffering(updates.offering)
    if (updates.details !== undefined) setFieldDetails(updates.details)
    if (updates.sender !== undefined) setFieldSender(updates.sender)
    if (updates.title !== undefined) setFieldTitle(updates.title)

    if (templateKey !== 'custom') {
      const generated = generateEmail(templateKey, {
        contact: nextContact,
        company: nextCompany,
        location: nextLocation,
        offering: nextOffering,
        details: nextDetails,
        sender: nextSender,
        title: nextTitle,
      })
      setEmailSubject(generated.subject)
      setEmailBody(generated.body)
    }
  }

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
          <form
            className="modal outreach-compose"
            onSubmit={sendEmail}
            onMouseDown={event => event.stopPropagation()}
            style={{ width: 'min(720px, 95vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <div>
                <div className="modal-title">Compose Outreach Email</div>
                <div className="modal-desc">
                  Sending through your connected Google account to <strong>{emailRow.emailAddr}</strong> ({emailRow.company})
                </div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setEmailRow(null)} aria-label="Close">×</button>
            </div>

            <div className="modal-body" style={{ display: 'grid', gap: 14, overflowY: 'auto', padding: '16px 22px' }}>
              {emailError && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>
                  {emailError}
                </div>
              )}

              {/* Template selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Message Template</label>
                  <span style={{ fontSize: 11.5, color: 'var(--t4)' }}>
                    {TEMPLATES.find(t => t.id === templateKey)?.desc}
                  </span>
                </div>
                <select
                  className="sel"
                  style={{ width: '100%', height: 36, fontWeight: 600 }}
                  value={templateKey}
                  onChange={e => handleTemplateChange(e.target.value as TemplateKey)}
                >
                  {TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.id === 'custom' ? '✍️ ' : '📋 '} {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fill-in Details Card (when not custom) */}
              {templateKey !== 'custom' && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--s2)', border: '1px solid var(--border-s)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Template Details &amp; Offering
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 500 }}>
                      Type or select suggestions to update the message
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: 11 }}>Offering / Equipment</label>
                      <SuggestInput
                        value={fieldOffering}
                        onChange={val => updateFieldAndApply({ offering: val })}
                        options={OFFERING_SUGGESTIONS}
                        placeholder="e.g. 20ft & 40ft shipping containers"
                        inputStyle={{ height: 32, fontSize: 12 }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: 11 }}>Location / Target Depot</label>
                      <SuggestInput
                        value={fieldLocation}
                        onChange={val => updateFieldAndApply({ location: val })}
                        options={locationSuggestions}
                        placeholder="e.g. Chicago, IL or your local area"
                        inputStyle={{ height: 32, fontSize: 12 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Offer / Pricing Note</label>
                    <SuggestInput
                      value={fieldDetails}
                      onChange={val => updateFieldAndApply({ details: val })}
                      options={OFFER_DETAILS_SUGGESTIONS}
                      placeholder="e.g. Depot-direct pricing with fast release."
                      inputStyle={{ height: 32, fontSize: 12 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: 11 }}>Sign-off / Sender Name</label>
                      <SuggestInput
                        value={fieldSender}
                        onChange={val => updateFieldAndApply({ sender: val })}
                        options={senderSuggestions}
                        placeholder="e.g. Sales Team"
                        inputStyle={{ height: 32, fontSize: 12 }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Sign-off Title</span>
                        <span style={{ fontSize: 10.5, color: 'var(--t4)', fontWeight: 400 }}>(Optional)</span>
                      </label>
                      <SuggestInput
                        value={fieldTitle}
                        onChange={val => updateFieldAndApply({ title: val })}
                        options={TITLE_SUGGESTIONS}
                        placeholder="e.g. Container Sales Specialist (optional)"
                        inputStyle={{ height: 32, fontSize: 12 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="form-label">Subject</label>
                <input
                  className="inp"
                  required
                  maxLength={200}
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder={templateKey === 'custom' ? 'Enter email subject…' : ''}
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="form-label">Message Body</label>
                <textarea
                  className="inp"
                  required
                  rows={12}
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  placeholder={templateKey === 'custom' ? 'Write your outreach message here…' : ''}
                  style={{
                    height: 'auto',
                    minHeight: 240,
                    padding: '12px 14px',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    lineHeight: 1.6,
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-s)', padding: '12px 22px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEmailRow(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
              >
                {sendingEmail ? 'Sending…' : 'Send email'}
              </button>
            </div>
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
          <RefreshButton cacheKey="leads:prospects" label="Contacts" onRefresh={() => setRevision(r => r + 1)} />
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
            {withElig.length === 0 && (
              <EmptyTableState
                colSpan={11}
                icon={I.outreach}
                title="No outreach contacts found"
                subtitle={search
                  ? 'No contacts match your search. Try a different company, name, phone or email.'
                  : 'This sheet lists your prospect contacts. Import or add prospects to fill it.'}
              />
            )}
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
                <td className="col-actions"><Btn variant="ghost" sm disabled={!r.emailable} onClick={() => handleOpenCompose(r)}>Compose</Btn></td>
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
