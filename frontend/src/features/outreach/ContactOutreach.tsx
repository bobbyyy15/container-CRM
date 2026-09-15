import React, { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import EmptyTableState from '../../components/ui/EmptyTableState'
import RefreshButton from '../../components/ui/RefreshButton'
import type { Screen, BadgeStatus, NavIntent, OutreachChannel } from '../../app/types'
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

// A batch shares one message, so a template for several recipients writes placeholders
// and each email fills them from its own prospect. Anything a prospect lacks falls back to
// wording that still reads naturally.
const PLACEHOLDER_HINT = '{contact}, {company} and {location} are filled in from each prospect when it sends.'

const locationOf = (row: any) => [row.city, row.state].filter(Boolean).join(', ')

const personalize = (text: string, row: any) => text
  .replace(/\{contact\}/g, row.contact || 'there')
  .replace(/\{company\}/g, row.company || 'your team')
  .replace(/\{location\}/g, locationOf(row) || 'your area')

type TemplateFields = { location: string; offering: string; details: string; sender: string; title: string }

const DEFAULT_TEMPLATE_FIELDS: TemplateFields = {
  location: '',
  offering: '20ft & 40ft shipping containers',
  details: 'Depot-direct pricing with immediate release.',
  sender: 'Sales Team',
  title: 'Container Sales Specialist',
}

type EmailSendResult = {
  id: string
  label: string
  email: string
  status: 'sent' | 'failed' | 'not_sent'
  message?: string
}

const MAX_BULK_EMAILS = 100
const BULK_SEND_DELAY_MS = 1200

const recipientLabel = (row: any) => row.contact || row.company || row.emailAddr
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const shouldStopBulkSend = (message: string) => /invalid_client|invalid_grant|oauth|authenticat|quota|rate.?limit|too many|daily.*limit|4\.7\.0|429/i.test(message)

const CHANNELS: { key: OutreachChannel; label: string }[] = [
  { key: 'all', label: 'All contacts' },
  { key: 'call', label: 'Call eligible' },
  { key: 'text', label: 'Text eligible' },
  { key: 'email', label: 'Email eligible' },
]

const ContactOutreach = ({ intent, onIntentApplied }: { intent?: NavIntent | null; onIntentApplied?: () => void } = {}) => {
  const pics = usePics()
  // The revision counter exists for the Refresh button -- useProspects re-fetches
  // when it changes, which a cache invalidation alone would not trigger.
  const [revision, setRevision] = useState(0)
  const prospectsData = useProspects(revision)
  const [search, setSearch] = useState('')
  // Eligibility is the whole point of this sheet, so it is a filter rather than something
  // to read off each row: pick Text eligible and what is left is exactly who can be texted.
  const [channel, setChannel] = useState<OutreachChannel>('all')
  const [stateFilter, setStateFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [emailRows, setEmailRows] = useState<any[]>([])
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [sendResults, setSendResults] = useState<EmailSendResult[]>([])
  const [sendProgress, setSendProgress] = useState({ completed: 0, total: 0, current: '' })
  const [stopRequested, setStopRequested] = useState(false)
  const stopBulkRef = useRef(false)

  // A count on Prospect Clients hands over what it was counting. Applied once and then
  // released, so coming back to this screen later does not silently re-filter.
  useEffect(() => {
    if (!intent) return
    if (intent.channel) setChannel(intent.channel)
    setStateFilter(intent.state ?? '')
    setSelected([])
    onIntentApplied?.()
  }, [intent, onIntentApplied])

  // A new filter is a new list: read it from the top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [channel, stateFilter, search])

  // Template picker. Changing a detail regenerates the message from the chosen template;
  // 'custom' leaves the subject and body entirely to the sender.
  const [templateKey, setTemplateKey] = useState<TemplateKey>('cold_intro')
  const [templateFields, setTemplateFields] = useState<TemplateFields>(DEFAULT_TEMPLATE_FIELDS)
  const composeLocked = sendingEmail || sendResults.length > 0

  const locationSuggestions = React.useMemo(() => {
    const own = emailRows.length === 1 ? locationOf(emailRows[0]) : '{location}'
    return own && !COMMON_DEPOTS.includes(own) ? [own, ...COMMON_DEPOTS] : COMMON_DEPOTS
  }, [emailRows])

  const senderSuggestions = React.useMemo(
    () => Array.from(new Set([...pics.map(p => p.name).filter(Boolean), 'Sales Team', 'Container Equipment Desk'])),
    [pics],
  )

  const applyTemplate = (key: TemplateKey, fields: TemplateFields, rows: any[]) => {
    if (key === 'custom') return
    const recipient = rows.length === 1
      ? { contact: rows[0].contact || '', company: rows[0].company || '' }
      : { contact: '{contact}', company: '{company}' }
    const generated = generateEmail(key, { ...recipient, ...fields })
    setEmailSubject(generated.subject)
    setEmailBody(generated.body)
  }

  const handleTemplateChange = (key: TemplateKey) => {
    setTemplateKey(key)
    if (key === 'custom') {
      setEmailSubject('')
      setEmailBody('')
    } else {
      applyTemplate(key, templateFields, emailRows)
    }
  }

  const updateTemplateField = (updates: Partial<TemplateFields>) => {
    const next = { ...templateFields, ...updates }
    setTemplateFields(next)
    applyTemplate(templateKey, next, emailRows)
  }

  const term = search.trim().toLowerCase()
  const filtered = prospectsData.filter(r =>
    !term || [r.company, r.contact, r.phone, r.emailAddr].some(value => String(value ?? '').toLowerCase().includes(term))
  )

  const scored = filtered.map(r => ({
    ...r,
    callable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only'),
    textable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only'),
    emailable: r.cat === 'Proceed' && !!r.emailAddr,
  }))

  const states = [...new Set(prospectsData.map(r => r.state).filter(Boolean))].sort() as string[]

  // Every eligibility already requires category Proceed, so choosing a channel narrows to
  // Proceed plus that channel -- the same set the Gmail composer will send to.
  const withElig = scored.filter(r =>
    (!stateFilter || r.state === stateFilter)
    && (channel === 'all'
      || (channel === 'call' && r.callable)
      || (channel === 'text' && r.textable)
      || (channel === 'email' && r.emailable)))

  // Only the rows in view are in the DOM. Rows are pinned to one height (long values
  // truncate rather than wrap) so the ones on screen can be derived from the scroll
  // position, with spacer rows standing in for the rest -- the scrollbar still measures the
  // whole list, and selection, copying and sending all act on every filtered row, not just
  // the drawn ones.
  const ROW_HEIGHT = 44
  const OVERSCAN = 6
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 800 })
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setViewport({ top: element.scrollTop, height: element.clientHeight })
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      element.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])

  const windowSize = Math.ceil(viewport.height / ROW_HEIGHT) + OVERSCAN * 2
  // Clamped to the end of the list: filtering can shrink the list under a scroll position
  // that is still deep, which would otherwise leave a screen showing one row or none.
  const windowStart = Math.min(
    Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN),
    Math.max(0, withElig.length - windowSize),
  )
  const windowEnd = Math.min(withElig.length, windowStart + windowSize)
  const shown = withElig.slice(windowStart, windowEnd)
  const padTop = windowStart * ROW_HEIGHT
  const padBottom = Math.max(0, (withElig.length - windowEnd) * ROW_HEIGHT)
  const COLUMN_COUNT = 11

  const allSelected = withElig.length > 0 && withElig.every(r => selected.includes(r.id))
  const toggleAll = () => setSelected(allSelected ? [] : withElig.map(r => r.id))
  const toggleOne = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Copying operates on the selection when one exists, otherwise every currently-filtered row
  // -- so the buttons are useful with or without an explicit selection.
  const activeRows = selected.length > 0 ? withElig.filter(r => selected.includes(r.id)) : withElig
  const selectedEmailRows = withElig.filter(r => selected.includes(r.id) && r.emailable)

  const openEmailComposer = (rows: any[]) => {
    if (rows.length > MAX_BULK_EMAILS) {
      toast(`Select at most ${MAX_BULK_EMAILS} eligible contacts per email batch.`, 'error')
      return
    }
    setEmailRows(rows)
    setEmailError('')
    setSendResults([])
    setSendProgress({ completed: 0, total: rows.length, current: '' })
    setStopRequested(false)
    stopBulkRef.current = false

    // One recipient gets their own location and PIC written in; a batch gets placeholders.
    const single = rows.length === 1 ? rows[0] : null
    const fields: TemplateFields = {
      ...templateFields,
      location: single ? locationOf(single) || 'your area' : '{location}',
      sender: single?.pic && single.pic !== 'Unassigned' ? single.pic : DEFAULT_TEMPLATE_FIELDS.sender,
    }
    setTemplateKey('cold_intro')
    setTemplateFields(fields)
    applyTemplate('cold_intro', fields, rows)
  }

  const closeEmailComposer = () => {
    if (sendingEmail) return
    setEmailRows([])
    setEmailSubject('')
    setEmailBody('')
    setEmailError('')
    setSendResults([])
  }

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
    if (emailRows.length === 0) return

    if (emailRows.length > 1) {
      const { confirmed } = await askConfirm({
        title: `Send ${emailRows.length} separate emails?`,
        message: 'Each eligible prospect will receive an individual message. Keep this page open until the batch finishes.',
        confirmLabel: 'Start sending',
      })
      if (!confirmed) return
    }

    setSendingEmail(true)
    setEmailError('')
    setSendResults([])
    setSendProgress({ completed: 0, total: emailRows.length, current: '' })
    setStopRequested(false)
    stopBulkRef.current = false

    const results: EmailSendResult[] = []
    let blockingMessage = ''

    for (let index = 0; index < emailRows.length; index += 1) {
      const row = emailRows[index]
      const label = recipientLabel(row)

      if (stopBulkRef.current || blockingMessage) {
        results.push({
          id: row.id,
          label,
          email: row.emailAddr,
          status: 'not_sent',
          message: blockingMessage || 'Stopped by user',
        })
        setSendResults([...results])
        setSendProgress({ completed: results.length, total: emailRows.length, current: '' })
        continue
      }

      setSendProgress({ completed: results.length, total: emailRows.length, current: label })
      try {
        await api.post('/outreach/email', {
          prospectId: row.id,
          to: row.emailAddr,
          subject: personalize(emailSubject, row),
          body: personalize(emailBody, row).replace(/\n/g, '<br />'),
        })
        results.push({ id: row.id, label, email: row.emailAddr, status: 'sent' })
      } catch (error: any) {
        const message = error.response?.data?.error?.message ?? error.message ?? 'Email could not be sent.'
        results.push({ id: row.id, label, email: row.emailAddr, status: 'failed', message })
        if (shouldStopBulkSend(message)) {
          blockingMessage = `Batch stopped: ${message}`
          setEmailError(blockingMessage)
        }
      }

      setSendResults([...results])
      setSendProgress({ completed: results.length, total: emailRows.length, current: '' })
      if (index < emailRows.length - 1 && !stopBulkRef.current && !blockingMessage) {
        await wait(BULK_SEND_DELAY_MS)
      }
    }

    const sentIds = new Set(results.filter(result => result.status === 'sent').map(result => result.id))
    const sent = results.filter(result => result.status === 'sent').length
    const failed = results.filter(result => result.status === 'failed').length
    const notSent = results.filter(result => result.status === 'not_sent').length
    setSelected(current => current.filter(id => !sentIds.has(id)))
    setSendingEmail(false)
    setSendProgress({ completed: results.length, total: emailRows.length, current: '' })
    toast(`${sent} sent, ${failed} failed${notSent ? `, ${notSent} not sent` : ''}.`, failed || notSent ? 'error' : 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {emailRows.length > 0 && (
        <div className="overlay" role="presentation" onMouseDown={closeEmailComposer}>
          <form className="modal outreach-compose" onSubmit={sendEmail} onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header"><div><div className="modal-title">Compose outreach email</div><div className="modal-desc">{emailRows.length === 1 ? `Sending through your connected Google account to ${emailRows[0].emailAddr}.` : `${emailRows.length} separate emails through your connected Google account. Recipients will not see each other.`}</div></div><button type="button" className="btn btn-ghost" disabled={sendingEmail} onClick={closeEmailComposer} aria-label="Close">×</button></div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              {emailError && <div style={{ padding: 10, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{emailError}</div>}
              {!composeLocked && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span className="form-label" style={{ marginBottom: 0 }}>Template</span>
                    <span style={{ fontSize: 11.5, color: 'var(--t4)' }}>{TEMPLATES.find(t => t.id === templateKey)?.desc}</span>
                  </div>
                  <select className="sel" style={{ width: '100%' }} value={templateKey} onChange={e => handleTemplateChange(e.target.value as TemplateKey)}>
                    {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {!composeLocked && templateKey !== 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--s2)', border: '1px solid var(--border-s)' }}>
                  <label><span className="form-label" style={{ fontSize: 11 }}>Offering / equipment</span>
                    <SuggestInput value={templateFields.offering} onChange={offering => updateTemplateField({ offering })} options={OFFERING_SUGGESTIONS} placeholder="e.g. 20ft & 40ft shipping containers" inputStyle={{ height: 32, fontSize: 12 }} />
                  </label>
                  <label><span className="form-label" style={{ fontSize: 11 }}>Location / depot</span>
                    <SuggestInput value={templateFields.location} onChange={location => updateTemplateField({ location })} options={locationSuggestions} placeholder="e.g. Chicago, IL" inputStyle={{ height: 32, fontSize: 12 }} />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}><span className="form-label" style={{ fontSize: 11 }}>Offer / pricing note</span>
                    <SuggestInput value={templateFields.details} onChange={details => updateTemplateField({ details })} options={OFFER_DETAILS_SUGGESTIONS} placeholder="e.g. Depot-direct pricing with fast release." inputStyle={{ height: 32, fontSize: 12 }} />
                  </label>
                  <label><span className="form-label" style={{ fontSize: 11 }}>Sign-off name</span>
                    <SuggestInput value={templateFields.sender} onChange={sender => updateTemplateField({ sender })} options={senderSuggestions} placeholder="e.g. Sales Team" inputStyle={{ height: 32, fontSize: 12 }} />
                  </label>
                  <label><span className="form-label" style={{ fontSize: 11 }}>Sign-off title <span style={{ color: 'var(--t4)', fontWeight: 400 }}>(optional)</span></span>
                    <SuggestInput value={templateFields.title} onChange={title => updateTemplateField({ title })} options={TITLE_SUGGESTIONS} placeholder="e.g. Container Sales Specialist" inputStyle={{ height: 32, fontSize: 12 }} />
                  </label>
                  {emailRows.length > 1 && <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--t3)' }}>{PLACEHOLDER_HINT}</div>}
                </div>
              )}
              <label><span className="form-label">Subject</span><input className="inp" required maxLength={200} disabled={composeLocked} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder={templateKey === 'custom' ? 'Enter email subject…' : ''} /></label>
              <label><span className="form-label">Message</span><textarea className="inp" required rows={12} disabled={composeLocked} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder={templateKey === 'custom' ? 'Write your outreach message here…' : ''} /></label>
              {(sendingEmail || sendResults.length > 0) && (
                <div className="bulk-email-progress">
                  <div className="bulk-email-progress-head">
                    <strong>{sendingEmail ? (sendProgress.current ? `Sending to ${sendProgress.current}` : 'Preparing next email') : 'Batch complete'}</strong>
                    <span>{sendProgress.completed} / {sendProgress.total}</span>
                  </div>
                  <div className="bulk-email-progress-track"><span style={{ width: `${sendProgress.total ? (sendProgress.completed / sendProgress.total) * 100 : 0}%` }} /></div>
                </div>
              )}
              {sendResults.length > 0 && (
                <div className="bulk-email-results" aria-live="polite">
                  {sendResults.map(result => (
                    <div className="bulk-email-result" key={result.id}>
                      <span className={`bulk-email-status ${result.status}`}>{result.status === 'sent' ? 'Sent' : result.status === 'failed' ? 'Failed' : 'Not sent'}</span>
                      <span><strong>{result.label}</strong><small>{result.email}{result.message ? ` — ${result.message}` : ''}</small></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {sendingEmail ? <button type="button" className="btn btn-ghost" disabled={stopRequested} onClick={() => { stopBulkRef.current = true; setStopRequested(true) }}>{stopRequested ? 'Stopping…' : 'Stop after current'}</button> : <button type="button" className="btn btn-ghost" onClick={closeEmailComposer}>{sendResults.length ? 'Close' : 'Cancel'}</button>}
              {sendResults.length === 0 && <button className="btn btn-primary" disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}>{sendingEmail ? `Sending ${sendProgress.completed + 1} of ${sendProgress.total}…` : emailRows.length === 1 ? 'Send email' : `Send ${emailRows.length} separate emails`}</button>}
            </div>
          </form>
        </div>
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Contact Outreach Sheet</div>
          <div className="page-desc">Select eligible contacts to send separate Gmail messages, or copy contact details for RingCentral and SMS campaigns.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selected.length > 0 && <Btn variant="primary" sm disabled={selectedEmailRows.length === 0 || sendingEmail} onClick={() => openEmailComposer(selectedEmailRows)}><Ic n={I.mail} size={13} /> Compose Selected ({selectedEmailRows.length})</Btn>}
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
        <select className="sel" value={channel} onChange={e => { setChannel(e.target.value as OutreachChannel); setSelected([]) }} aria-label="Outreach channel">
          {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className="sel" value={stateFilter} onChange={e => { setStateFilter(e.target.value); setSelected([]) }} aria-label="State">
          <option value="">All states</option>
          {states.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        {(channel !== 'all' || stateFilter || search) && (
          <Btn variant="ghost" sm onClick={() => { setChannel('all'); setStateFilter(''); setSearch(''); setSelected([]) }}><Ic n={I.x} size={13} /> Clear</Btn>
        )}
        <div className="toolbar-right">
          <span className="count-label">{withElig.length.toLocaleString()} contacts</span>
          <RefreshButton cacheKey="leads:prospects" label="Contacts" onRefresh={() => setRevision(r => r + 1)} />
          <Btn variant="primary" sm style={{ background: '#1F2937' }} onClick={() => handleCopy('RingCentral Format', r => r.phone || null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy RingCentral Format</Btn>
        </div>
      </div>

      <div className="table-wrap" ref={scrollRef}>
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
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={COLUMN_COUNT} /></tr>}
            {shown.map(r => (
              <tr key={r.id} className="row-fixed" style={{ height: ROW_HEIGHT, background: r.cat === 'Removed' ? 'var(--red-bg)' : undefined }}>
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
                <td className="col-actions"><Btn variant="ghost" sm disabled={!r.emailable} onClick={() => openEmailComposer([r])}>Compose</Btn></td>
              </tr>
            ))}
            {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={COLUMN_COUNT} /></tr>}
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
