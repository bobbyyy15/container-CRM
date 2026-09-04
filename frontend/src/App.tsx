import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from './config/supabase'
import { api } from './lib/api'
import { useRealtimeRevision, useRealtimeStatus } from './lib/realtime'
import { toast, askConfirm, askReason, ToastHost, ConfirmHost } from './lib/notify'
import Login from './Login'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import Dashboard from './features/dashboard/Dashboard'
import OutreachDashboard from './features/outreach/OutreachDashboard'
import InquiryDashboard from './features/inquiries/InquiryDashboard'
import ProspectSheet from './features/prospects/ProspectSheet'
import InquiryList from './features/inquiries/InquiryList'
import QuotationList from './features/quotations/QuotationList'
import SalesTracker from './features/sales/SalesTracker'
import CustomerAccounts from './features/customers/CustomerAccounts'
import { Ic, I } from './components/ui/icons'
import Btn from './components/ui/Button'
import { Badge, Trend, Prog, Divider, EligDot, ChipPIC } from './components/ui/primitives'
import ExportMenu from './components/ui/ExportMenu'
import AssignPicModal from './components/ui/AssignPicModal'
import RecordDetailModal from './components/ui/RecordDetailModal'
import { NAV, SCREEN_LABELS } from './app/navigation'
import type {
  Screen, BadgeStatus, DetailField,
  ProfitChartPoint, ChartSlice, PicPerformanceRow, OverduePickupRow, LossReasonRow,
  AlternativeOffer, Territory, GoogleConnectionStatus, RemovedMatchRow, DensityOption,
} from './app/types'
import { exportToCSV, downloadPdfDocument, titleCase, readDensity, writeDensity } from './lib/exporters'
import { mapPipelineRow } from './hooks/mapPipelineRow'
import { useWarmLeads } from './hooks/useWarmLeads'
import { useProspects } from './hooks/useProspects'
import { useInquiries } from './hooks/useInquiries'
import { useQuotations } from './hooks/useQuotations'
import { useSales } from './hooks/useSales'
import { useAnalytics } from './hooks/useAnalytics'
import { useNotifications } from './hooks/useNotifications'
import { useContracts } from './hooks/useContracts'
import { useCustomers } from './hooks/useCustomers'
import { useInventory, useInventorySummary } from './hooks/useInventory'
import { useCatalogList } from './hooks/useCatalogList'
import { useInquiryBoard } from './hooks/useInquiryBoard'
// Admin screens and the import dialog are reached rarely, so they load on demand
// instead of riding along in the initial bundle. Login stays eager -- it is the
// first thing an unauthenticated visitor sees.
const UserProfileSettings = lazy(() => import('./features/settings/UserProfileSettings').then(m => ({ default: m.UserProfileSettings })))
const UserManagement = lazy(() => import('./features/settings/UserManagement').then(m => ({ default: m.UserManagement })))
const ResetPassword = lazy(() => import('./features/settings/ResetPassword'))
import {
  NewInquiryDialog,
  NewWarmLeadDialog,
  NewProspectDialog,
  NewManualSaleDialog,
  NewContractDialog,
  QuotationDialog,
  SaleDialog,
  usePics,
  type InquiryOption,
  type QuotationOption,
  type WarmLeadOption,
} from './features/pipeline/PipelineDialogs'

import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts'

// xlsx is ~490KB, so it's loaded on demand rather than bundled into the initial
// payload -- same pattern the Excel importers already use.

// ─── PDF reporting ────────────────────────────────────────────────────────────
// Every "PDF" action builds a real tabular document -- masthead, metadata line,
// then one bordered table per section -- and prints only that. Printing the live
// screen instead just photographs the dashboard onto paper, which is not a report.

// Brand palette, as RGB triples because jsPDF takes numeric channels.

// Row objects use terse internal keys (co, buyPU, neededBy...). Left alone they
// produce unreadable column headings, so map the worst offenders and split
// camelCase for the rest.

// Internal identifiers are meaningless in a printed report (they stay in the CSV
// and Excel exports, where data fidelity matters more than readability).


// ─── Persisted UI preferences ─────────────────────────────────────────────────
// localStorage throws rather than no-ops in some contexts (Safari private mode,
// blocked third-party storage), so every access is guarded -- a preference is
// never worth crashing a screen over.






// `enabled` exists because ProspectSheet renders both the Prospect and Warm Lead
// views from one component -- without it, opening either page fetched both lists.








// `limit` keeps the dashboard's "top 5" from pulling the entire customer table
// across the network just to discard almost all of it.



// A read-only detail view for a single row of an already-loaded list (Inquiries, Quotations,
// Sales, Contracts, Customers, etc). No extra API call needed -- the row already has every
// field the table shows, this just lays them out full-size instead of squeezed into a table cell.
// ─── Sidebar ──────────────────────────────────────────────────────────────────

// ─── TopBar ───────────────────────────────────────────────────────────────────


// ─── Dashboard ────────────────────────────────────────────────────────────────

// ─── Outreach Dashboard ───────────────────────────────────────────────────────

// ─── Inquiry Dashboard ────────────────────────────────────────────────────────

// ─── Prospect / Warm Lead Sheet ───────────────────────────────────────────────

// ─── Inquiry List ─────────────────────────────────────────────────────────────

// ─── Quotation List ───────────────────────────────────────────────────────────

// ─── Sales Tracker ────────────────────────────────────────────────────────────

// ─── Customer Accounts ────────────────────────────────────────────────────────

// ─── Contact Outreach Sheet ───────────────────────────────────────────────────

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

// ─── Contracts ────────────────────────────────────────────────────────────────

const Contracts = () => {
  const [status, setStatus] = useState('All Statuses');
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [revision, setRevision] = useState(0);
  const [viewRow, setViewRow] = useState<any>(null);
  const contracts = useContracts(status, pickStatus, search, revision);
  // Re-fetch sales when clicking New Contract
  const sales = useSales(revision);
  const overdueContracts = contracts.filter(c => c.pickStatus === 'Overdue');
  const contractTransitions = (contract: any) => {
    if (contract.status === 'Pending Signature') return ['Active', 'Cancelled'];
    if (contract.status === 'Active') return contract.storedPickStatus === 'Picked Up' ? ['Completed'] : ['Cancelled'];
    return [];
  };
  const updateContractStatus = async (id: string, nextStatus: string) => {
    try {
      await api.patch(`/contracts/${id}`, { status: nextStatus });
      toast(`Contract marked ${nextStatus}`, 'success');
      setRevision(value => value + 1);
    } catch (error: any) {
      toast(error.response?.data?.error?.message ?? 'Contract status could not be updated', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {overdueContracts.length > 0 && (
        <div style={{ padding: '10px 20px', background: 'var(--red-bg)', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ic n={I.warning} size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red-text)' }}>
            {overdueContracts.length === 1
              ? `1 pickup is overdue — ${overdueContracts[0].co} · ${overdueContracts[0].ref}`
              : `${overdueContracts.length} pickups are overdue`}
          </span>
        </div>
      )}
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contracts…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={status} onChange={e => setStatus(e.target.value)}><option>All Statuses</option><option>Pending Signature</option><option>Active</option><option>Completed</option><option>Cancelled</option></select>
        <select className="sel" value={pickStatus} onChange={e => setPickStatus(e.target.value)}><option>All Pickup Statuses</option><option>Pending</option><option>Scheduled</option><option>Confirmed</option><option>Picked Up</option><option>Overdue</option></select>
        <div className="toolbar-right">
          <Btn variant="primary" sm onClick={() => setShowNew(true)}><Ic n={I.plus} size={13} /> New Contract</Btn>
          {showNew && <NewContractDialog sales={sales} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); setRevision(r => r + 1); }} />}
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Contract #</th><th>Company</th><th>Container</th><th className="r">Qty</th>
            <th className="r">Value</th><th>Pickup Date</th><th>Pickup Status</th>
            <th>Status</th><th>PIC</th><th>Source Sale</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id} style={{ background: c.pickStatus === 'Overdue' ? 'var(--red-bg)' : undefined }}>
                <td><span className="ref-id" style={{ color: 'var(--teal)' }}>{c.ref}</span></td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{c.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{c.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{c.category} · {c.size}</td>
                <td className="r mono bold">{c.qty}</td>
                <td className="r revenue-cell">${c.value.toLocaleString()}</td>
                <td className="mono" style={{ fontSize: 12 }}>{c.pickup}</td>
                <td><Badge status={c.pickStatus as BadgeStatus} /></td>
                <td><Badge status={c.status as BadgeStatus} /></td>
                <td><ChipPIC label={c.pic} /></td>
                <td><span className="ref-id" style={{ color: 'var(--green)', fontSize: 11 }}>{c.sale}</span></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(c)}>View</Btn>
                    {contractTransitions(c).length > 0 && <select className="sel" value="" aria-label={`Update ${c.ref} status`} onChange={e => { if (e.target.value) updateContractStatus(c.id, e.target.value) }} style={{ padding: '4px 8px', fontSize: 11, minWidth: 110 }}><option value="">Change status…</option>{contractTransitions(c).map(next => <option key={next}>{next}</option>)}</select>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Contract ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.co },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Pickup status', value: <Badge status={viewRow.pickStatus as BadgeStatus} /> },
            { label: 'Container', value: `${viewRow.category} · ${viewRow.size}` },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Reserved inventory', value: viewRow.inventory },
            { label: 'Value', value: `$${viewRow.value.toLocaleString()}` },
            { label: 'Pickup date', value: viewRow.pickup },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Source sale', value: viewRow.sale },
          ]}
        />
      )}
    </div>
  )
}

// ─── Daily Tasks ──────────────────────────────────────────────────────────────

const ACTIVITY_SECTIONS: {
  title: string; icon: string; color: string;
  fields: { key: string; label: string; targetKey?: string }[]
}[] = [
  { title: 'Email Activity', icon: I.mail, color: '#315EF6', fields: [
    { key: 'emails_completed', label: 'Emails Completed', targetKey: 'daily_email_target' },
    { key: 'email_replies',    label: 'Email Replies' },
    { key: 'emails_bounced',   label: 'Bounced / Failed' },
  ]},
  { title: 'Call Activity', icon: I.phone, color: '#0D9488', fields: [
    { key: 'calls_completed',  label: 'Calls Completed', targetKey: 'daily_call_target_min' },
    { key: 'calls_answered',   label: 'Calls Answered' },
    { key: 'calls_unanswered', label: 'Calls Unanswered' },
  ]},
  { title: 'Text / SMS Activity', icon: I.inquiry, color: '#7C3AED', fields: [
    { key: 'texts_completed',  label: 'Texts Completed', targetKey: 'daily_text_target' },
    { key: 'text_replies',     label: 'Text Replies' },
    { key: 'texts_opted_out',  label: 'Opted Out' },
  ]},
]

const BLANK_ACTIVITY: Record<string, number> = Object.fromEntries(
  ACTIVITY_SECTIONS.flatMap(s => s.fields.map(f => [f.key, 0]))
)

const DailyTasks = () => {
  const pics = usePics()
  const [picId, setPicId] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState<Record<string, number>>(BLANK_ACTIVITY)
  const [notes, setNotes] = useState('')
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setTargets(res.data.data || {}) })
      .catch(() => {})
  }, [])

  // Default to the signed-in user's own PIC identity where there is one.
  useEffect(() => {
    if (picId || !pics.length) return
    api.get('/auth/me')
      .then(res => {
        const mine = res.data.data?.pic_id
        setPicId(pics.some(p => p.id === mine) ? mine : pics[0].id)
      })
      .catch(() => setPicId(pics[0].id))
  }, [pics, picId])

  // Load whatever is already recorded for this PIC/date so the form edits rather
  // than silently overwrites -- the upsert is keyed on (pic_id, entry_date).
  useEffect(() => {
    if (!picId || !entryDate) return
    setLoading(true)
    api.get('/settings/daily-activity', { params: { pic_id: picId, entry_date: entryDate } })
      .then(res => {
        const { activity, results: derived } = res.data.data || {}
        setResults(derived || {})
        if (activity) {
          setForm(Object.fromEntries(Object.keys(BLANK_ACTIVITY).map(k => [k, activity[k] ?? 0])))
          setNotes(activity.notes || '')
        } else {
          setForm(BLANK_ACTIVITY)
          setNotes('')
        }
      })
      .catch(() => toast('Could not load that day’s activity.', 'error'))
      .finally(() => setLoading(false))
  }, [picId, entryDate])

  const save = async () => {
    if (!picId) return toast('Select a PIC first.', 'error')
    setSaving(true)
    try {
      await api.post('/settings/daily-activity', { pic_id: picId, entry_date: entryDate, ...form, notes })
      toast('Daily activity saved.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save the entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async () => {
    setShowHistory(true)
    try {
      const res = await api.get('/settings/daily-activity/recent', { params: { limit: 30 } })
      setHistory(res.data.data || [])
    } catch {
      toast('Could not load previous entries.', 'error')
    }
  }

  const friendlyDate = new Date(`${entryDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="page-scroll">
      <div className="page-header" style={{ borderBottom: 'none' }}>
        <div>
          <div className="page-title">Daily Completed Tasks</div>
          <div className="page-desc">Record outreach activity completed on {friendlyDate}. These numbers feed the Outreach Dashboard and PIC Performance.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={openHistory}><Ic n={I.calendar} size={13} /> Previous Entries</Btn>
          <Btn variant="primary" sm onClick={save} disabled={saving || loading}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : "Save Today's Entry"}
          </Btn>
        </div>
      </div>
      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.title} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic n={section.icon} size={16} style={{ color: section.color }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{section.title}</span>
            </div>
            {section.fields.map(f => {
              const target = f.targetKey ? Number(targets[f.targetKey]) || 0 : 0
              const done = Number(form[f.key]) || 0
              return (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.label}</span>
                    {target > 0 && (
                      <span style={{ fontWeight: 600, color: done >= target ? 'var(--green)' : 'var(--t4)' }}>
                        {done} / {target}
                      </span>
                    )}
                  </label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] || ''}
                    placeholder="0"
                    onChange={e => setForm({ ...form, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                    style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
                  />
                </div>
              )
            })}
          </div>
        ))}

        {/* Results are counted from the pipeline itself rather than typed in, so they
            can't drift away from what actually happened in the CRM. */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Leads &amp; Conversions</div>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 14 }}>Counted automatically from this PIC's pipeline activity on this date.</div>
          {[
            { label: 'Warm Leads Generated', key: 'warm_leads' },
            { label: 'Inquiries Generated',  key: 'inquiries' },
            { label: 'Quotations Generated', key: 'quotations' },
            { label: 'Sales Generated',      key: 'sales' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{f.label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{results[f.key] ?? 0}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 18, gridColumn: '2 / 4' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>PIC &amp; Notes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Entry Date</label>
              <input className="inp" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">PIC (Person In Charge)</label>
              <select className="sel" style={{ width: '100%', height: 36 }} value={picId} onChange={e => setPicId(e.target.value)}>
                {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <textarea className="inp" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Daily notes, challenges, observations…" style={{ height: 'auto', padding: '10px 12px' }} />
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Previous Entries</div>
              <Btn variant="ghost" sm onClick={() => setShowHistory(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: 420, overflow: 'auto' }}>
              {history.length === 0 ? (
                <div className="empty"><div className="empty-title">No entries recorded yet</div><div className="empty-desc">Saved daily activity will appear here.</div></div>
              ) : (
                <table className="crm">
                  <thead><tr>
                    <th>Date</th><th>PIC</th><th className="r">Emails</th><th className="r">Calls</th><th className="r">Texts</th><th>Notes</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h: any) => (
                      <tr key={h.id} onClick={() => { setPicId(h.pic_id); setEntryDate(h.entry_date); setShowHistory(false) }}>
                        <td className="mono" style={{ fontSize: 12 }}>{h.entry_date}</td>
                        <td style={{ fontSize: 12.5, fontWeight: 600 }}>{h.pics?.name || '—'}</td>
                        <td className="r mono">{h.emails_completed}</td>
                        <td className="r mono">{h.calls_completed}</td>
                        <td className="r mono">{h.texts_completed}</td>
                        <td style={{ fontSize: 12, color: 'var(--t3)' }} className="truncate">{h.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Removed Sheet ────────────────────────────────────────────────────────────

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

// ─── Deliverability ───────────────────────────────────────────────────────────


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

// ─── Container Catalog ────────────────────────────────────────────────────────


const ContainerCatalog = () => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')

  return (
    <div className="page-scroll">
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 0 }}>
          <div>
            <div className="page-title">Container Catalog</div>
            <div className="page-desc">Sizes and condition grades offered on quotations and inquiries. This CRM doesn't track physical unit inventory -- pricing is set per quotation.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Available Sizes</div>
            {sizes.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {sizes.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No sizes configured.</div>}
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Condition Grades</div>
            {conditions.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {conditions.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No condition grades configured.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PIC Performance ─────────────────────────────────────────────────────────

const PICPerformance = () => {
  const analytics = useAnalytics();
  const PIC_DATA: PicPerformanceRow[] = analytics?.charts?.PIC_DATA || [];
  return (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 16 }}>
      <p className="greeting-title">PIC Performance</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Not a dropdown: PIC_DATA is computed server-side for the current calendar
            month only, so there's nothing to select yet. */}
        <div className="date-range" style={{ cursor: 'default' }} title="Scored on the current calendar month">
          <Ic n={I.calendar} size={13} /><span>This Month</span>
        </div>
        <ExportMenu data={PIC_DATA} filename="pic_performance" />
      </div>
    </div>
    <div className="page-content" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {PIC_DATA.map((p, i) => (
          <div key={p.name} className="kpi-featured" style={{ background: ['#2D4FE0','#6D28D9','#065F46','#92400E'][i] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{p.name}</span>
              <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: 'rgba(255,255,255,0.2)', color: 'white' }}>{p.initials}</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>${p.profit.toLocaleString()}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{p.sales} sales · {p.units} units</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="crm">
          <thead><tr>
            <th>#</th><th>PIC</th><th className="r">Calls</th><th className="r">Emails</th>
            <th className="r">Texts</th><th className="r">Warm Leads</th><th className="r">Inquiries</th>
            <th className="r">Quotes</th><th className="r">Sales</th><th className="r">Units</th>
            <th className="r">Revenue</th><th className="r">Gross Profit</th>
          </tr></thead>
          <tbody>
            {PIC_DATA.map((p, i) => (
              <tr key={p.name}>
                <td>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#FEF3C7' : 'var(--s3)', color: i === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i] }}>{p.initials}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.name}</span>
                  </div>
                </td>
                <td className="r mono">{p.calls}</td>
                <td className="r mono">{p.emails.toLocaleString()}</td>
                <td className="r mono">{p.texts}</td>
                <td className="r mono bold">{p.leads}</td>
                <td className="r mono bold">{p.inquiries}</td>
                <td className="r mono">{p.quotes}</td>
                <td className="r mono bold">{p.sales}</td>
                <td className="r mono bold">{p.units}</td>
                <td className="r revenue-cell">${p.revenue.toLocaleString()}</td>
                <td className="r profit-cell">${p.profit.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}

// ─── Profit Analytics ─────────────────────────────────────────────────────────

const ProfitAnalytics = () => {
  const analytics = useAnalytics();
  const profitChartData: ProfitChartPoint[] = analytics?.charts?.profitChartData || [];
  const revenue = analytics?.metrics?.total_revenue ?? 0;
  const grossProfit = analytics?.metrics?.total_gross_profit ?? 0;
  // Buying cost isn't returned separately -- it's the difference by definition, since
  // gross_profit is computed as revenue - buying_cost when a sale is recorded.
  const buyingCost = revenue - grossProfit;
  const margin = analytics?.metrics?.profit_margin ?? 0;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 0 }}>
      <p className="greeting-title">Profit Analytics</p>
      {/* Not a dropdown: these KPIs are all-time totals, not year-scoped -- labeled
          accordingly rather than a "2024 YTD" claim the numbers don't back up. */}
      <div className="date-range" style={{ cursor: 'default' }} title="All-time totals">
        <Ic n={I.calendar} size={13} /><span>All-Time</span>
      </div>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Revenue', val: money(revenue), color: 'var(--brand)' },
          { label: 'Total Buying Cost', val: money(buyingCost), color: 'var(--t3)' },
          { label: 'Total Gross Profit', val: money(grossProfit), color: 'var(--green)' },
          { label: 'Avg Profit Margin', val: `${margin.toFixed(1)}%`, color: 'var(--teal)' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">Monthly Gross Profit vs Revenue</div>
            <div className="chart-sub">$5,000/month target line shown as dashed</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={profitChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
            <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--t4)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--t4)' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `$${(v/1000).toFixed(0)}K`} width={40} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']} />
            <Area type="monotone" dataKey="revenue" stroke="#315EF6" fill="#315EF608" strokeWidth={2} name="Revenue" />
            <Area type="monotone" dataKey="profit" stroke="#059669" fill="#05966910" strokeWidth={2} name="Profit" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
  );
}

// ─── Best Clients ─────────────────────────────────────────────────────────────

const BestClients = () => {
  const [search, setSearch] = useState('')
  const customers = useCustomers('All', search)
  const ranked = [...customers].sort((a, b) => b.profit - a.profit)

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Best Clients</div>
            <div className="page-desc">Every customer, ranked by gross profit generated.</div>
          </div>
        </div>
        <div className="toolbar" style={{ padding: 0, marginBottom: 14 }}>
          <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="toolbar-right">
            <span className="count-label">{ranked.length} clients</span>
            <ExportMenu data={ranked} filename="best-clients" />
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="crm" style={{ width: '100%' }}>
            <thead><tr>
              <th style={{ width: 44 }}>#</th><th>Company</th><th>Contact</th><th>PIC</th>
              <th className="r">Sales</th><th className="r">Units</th><th className="r">Revenue</th>
              <th className="r">Gross Profit</th><th>Last Purchase</th><th>Status</th>
            </tr></thead>
            <tbody>
              {ranked.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#FEF3C7' : 'var(--s3)', color: i === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  </td>
                  <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{c.co}</td>
                  <td style={{ fontSize: 12.5 }}>{c.contact}</td>
                  <td><ChipPIC label={c.pic} /></td>
                  <td className="r mono bold">{c.sales}</td>
                  <td className="r mono bold">{c.units}</td>
                  <td className="r revenue-cell">${c.revenue.toLocaleString()}</td>
                  <td className="r profit-cell">${c.profit.toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{c.last}</td>
                  <td><Badge status={c.status as BadgeStatus} /></td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>No customers with a purchase history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inquiry Funnel ───────────────────────────────────────────────────────────

// Real inquiry.status values, as actually set by the backend (see
// create_inquiry_from_warm_lead / create_quotation / convert_to_sale in the SQL migrations)
// -- not the larger aspirational status list in BadgeStatus, most of which nothing ever sets.
const INQUIRY_FUNNEL_STAGES = [
  { statuses: ['Under Review'], label: 'Under Review', color: '#315EF6' },
  { statuses: ['Quotation Created'], label: 'Quotation Created', color: '#7C3AED' },
  { statuses: ['Converted to Sale'], label: 'Converted to Sale', color: '#059669' },
]

const InquiryFunnel = () => {
  const inquiries = useInquiries(0, 'all')
  const stageCounts = INQUIRY_FUNNEL_STAGES.map(stage => ({
    ...stage,
    count: inquiries.filter(r => stage.statuses.includes(r.status)).length,
  }))
  const total = stageCounts.reduce((sum, s) => sum + s.count, 0)
  const lostCount = inquiries.filter(r => ['Lost', 'Removed'].includes(r.status)).length
  const maxCount = Math.max(1, ...stageCounts.map(s => s.count))

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Inquiry Funnel</div>
            <div className="page-desc">Where {total} tracked inquiries stand today, stage by stage.</div>
          </div>
        </div>
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stageCounts.map((s, i) => {
              const pctOfMax = (s.count / maxCount) * 100
              const pctOfTotal = total > 0 ? (s.count / total) * 100 : 0
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2)' }}>{i + 1}. {s.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{s.count} <span style={{ color: 'var(--t4)', fontWeight: 500 }}>({pctOfTotal.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 22, borderRadius: 6, background: 'var(--s2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctOfMax}%`, background: s.color, borderRadius: 6, transition: 'width 0.3s ease', minWidth: s.count > 0 ? 4 : 0 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Total Tracked Inquiries</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{total}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Converted to Sale</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{stageCounts[stageCounts.length - 1].count}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Lost / Removed</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--mono)' }}>{lostCount}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Inquiry Validation (Procurement) ──────────────────────────────────────────



const RejectTicketModal = ({ ticketRef, onClose, onReject }: {
  ticketRef: string
  onClose: () => void
  onReject: (reason: string, alternative: AlternativeOffer) => Promise<void>
}) => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')
  const [reason, setReason] = useState('')
  const [altSize, setAltSize] = useState('')
  const [altCondition, setAltCondition] = useState('')
  const [altQuantity, setAltQuantity] = useState('')
  const [altPrice, setAltPrice] = useState('')
  const [altNotes, setAltNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      await onReject(reason.trim(), {
        containerSizeId: altSize || undefined,
        containerConditionId: altCondition || undefined,
        quantity: altQuantity ? Number(altQuantity) : undefined,
        askingPrice: altPrice ? Number(altPrice) : undefined,
        notes: altNotes.trim() || undefined,
      })
    } catch (error: any) {
      setSubmitError(error.response?.data?.error?.message ?? 'Could not reject this ticket. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Reject {ticketRef}</div>
          <Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reason (required)</label>
            <textarea className="inp" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why isn't this ticket viable as-is?" style={{ height: 'auto', padding: '8px 12px' }} />
          </div>
          <div style={{ borderTop: '1px solid var(--border-s)', paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Alternative changes (optional)</div>
            <div style={{ fontSize: 11.5, color: 'var(--t4)', marginBottom: 10 }}>Change at least one size, condition, quantity, or price field to give Sales an alternative they can apply. Notes alone are context only.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Size</label>
                <select className="inp" value={altSize} onChange={e => setAltSize(e.target.value)}>
                  <option value="">Unchanged</option>
                  {sizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Condition</label>
                <select className="inp" value={altCondition} onChange={e => setAltCondition(e.target.value)}>
                  <option value="">Unchanged</option>
                  {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Quantity</label>
                <input className="inp" type="number" min={1} value={altQuantity} onChange={e => setAltQuantity(e.target.value)} placeholder="Unchanged" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Asking price</label>
                <input className="inp" type="number" min={0} value={altPrice} onChange={e => setAltPrice(e.target.value)} placeholder="Unchanged" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Notes</label>
              <textarea className="inp" rows={2} value={altNotes} onChange={e => setAltNotes(e.target.value)} placeholder="Any context that doesn't fit the fields above" style={{ height: 'auto', padding: '8px 12px' }} />
            </div>
          </div>
          {submitError && <div className="validation-error" role="alert"><Ic n={I.warning} size={14} /> {submitError}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" disabled={!reason.trim() || submitting} onClick={submit}>
            {submitting ? 'Rejecting…' : 'Reject Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ticketAge = (createdAt: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 36e5))
  if (hours < 1) return 'Just arrived'
  if (hours < 24) return `${hours}h waiting`
  return `${Math.floor(hours / 24)}d waiting`
}

const validationStatusLabel = (status: string) => status === 'Under Review' ? 'Approved / Ready to Quote' : status
const validationStatusTone = (status: string) => ({
  'Under Review': 'b-green',
  'Validation Rejected': 'b-red',
  'Quotation Rejected': 'b-orange',
  'Quotation Created': 'b-purple',
  'Converted to Sale': 'b-green',
}[status] || 'b-gray')

const ValidationQueueItem = ({ ticket, active, onSelect }: { ticket: any; active: boolean; onSelect: () => void }) => (
  <button className={`validation-queue-item${active ? ' active' : ''}`} onClick={onSelect} type="button">
    <div className="validation-queue-topline">
      <span className="ref-id">{ticket.ref}</span>
      <span className={`validation-age${ticketAge(ticket.createdAt).includes('d waiting') ? ' overdue' : ''}`}>{ticketAge(ticket.createdAt)}</span>
    </div>
    <div className="validation-company">{ticket.company || 'Unnamed company'}</div>
    <div className="validation-contact">{ticket.contact || 'No contact'} · {ticket.pic}</div>
    <div className="validation-spec-line">
      <span>{ticket.size}</span><span>{ticket.condition}</span><span>{ticket.quantity} unit{ticket.quantity === 1 ? '' : 's'}</span>
    </div>
    <div className="validation-location"><Ic n={I.map} size={12} /> {ticket.location}</div>
  </button>
)

const InfoBox = ({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) => (
  <div style={{ background: accent ? `${accent}0d` : 'var(--s2)', border: `1px solid ${accent ? accent + '40' : 'var(--border-s)'}`, borderRadius: 10, padding: 14 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: accent || 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{children}</div>
  </div>
)

const LiveStockWidget = ({ size, condition }: { size: string; condition: string }) => {
  const [stock, setStock] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!size || !condition || size === '—' || condition === '—') {
      setLoading(false)
      return
    }
    api.get('/inventory/stock-check', { params: { size, condition } })
      .then(res => {
        if (res.data.success) setStock(res.data.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [size, condition])

  if (loading) return <div style={{ fontSize: 11, color: 'var(--t4)', padding: 8 }}>Checking live inventory…</div>
  if (!stock) return null

  const physical = Number(stock.total_available || 0)
  const reserved = Number(stock.total_reserved || 0)
  const sellable = Number(stock.total_sellable ?? Math.max(0, physical - reserved))
  const isAvailable = sellable > 0
  const isLow = sellable > 0 && sellable <= 2

  return (
    <div style={{
      background: isAvailable ? (isLow ? '#FFFBEB' : '#ECFDF5') : '#FEF2F2',
      border: `1px solid ${isAvailable ? (isLow ? '#FDE68A' : '#A7F3D0') : '#FECACA'}`,
      borderRadius: 10, padding: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: isAvailable ? (isLow ? '#92400E' : '#065F46') : '#991B1B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Live Yard Stock Check
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
          background: isAvailable ? (isLow ? '#FEF3C7' : '#D1FAE5') : '#FEE2E2',
          color: isAvailable ? (isLow ? '#92400E' : '#065F46') : '#991B1B'
        }}>
          {isAvailable ? (isLow ? `Low Stock (${sellable} sellable)` : `In Stock (${sellable} sellable)`) : 'Out of Stock (0 sellable)'}
        </span>
      </div>
      <div className="stock-summary-row">
        <span><b>{physical}</b> physical</span>
        <span><b>{reserved}</b> reserved</span>
        <span><b>{sellable}</b> sellable</span>
      </div>
      {stock.depots && stock.depots.length > 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--t2)', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {stock.depots.map((d: any, idx: number) => (
            <span key={idx} style={{ background: 'rgba(255,255,255,0.7)', padding: '3px 7px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
              <strong>{d.depot}</strong>: {d.sellable ?? Math.max(0, Number(d.available || 0) - Number(d.reserved || 0))} sellable ({d.reserved} reserved)
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>
          No active depot inventory matching this exact size and condition.
        </div>
      )}
    </div>
  )
}

const TicketDecisionPanel = ({ t, onApprove, onReject, processing }: {
  t: any
  onApprove?: () => void
  onReject?: () => void
  processing?: boolean
}) => (
  <section className="validation-detail-card">
      <div className="validation-detail-header">
        <div>
          <div className="validation-detail-eyebrow">
            {t.ref} · REQUESTED BY {(t.pic || 'UNASSIGNED').toUpperCase()}
          </div>
          <div className="validation-detail-title">{t.company}</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 2 }}>{t.contact}</div>
        </div>
        <Badge status={t.status as BadgeStatus} />
      </div>
      <div className="validation-detail-body">
        <div className="validation-info-grid">
          <InfoBox label="Location">{t.location}</InfoBox>
          <InfoBox label="Container Size">{t.size}</InfoBox>
          <InfoBox label="Condition">{t.condition}</InfoBox>
          <InfoBox label="Quantity">{t.quantity}</InfoBox>
          <InfoBox label="Needed By">{t.neededBy}</InfoBox>
          <InfoBox label="Target Price">{t.price != null ? `$${t.price.toLocaleString()}` : '—'}</InfoBox>
        </div>

        <LiveStockWidget size={t.size} condition={t.condition} />

        <div className="validation-note-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            <Ic n={I.calendar} size={12} /> Ticket Timeline
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div style={{ fontSize: 10.5, color: 'var(--t4)', marginBottom: 2 }}>Received</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{t.date}</div></div>
            <div><div style={{ fontSize: 10.5, color: 'var(--t4)', marginBottom: 2 }}>Status</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{t.status}</div></div>
          </div>
        </div>

        <div className="validation-note-box">
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Description</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{t.description}</div>
        </div>

        {t.rejectionReason && (
          <InfoBox label="Rejection Reason" accent="var(--red)">
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t.rejectionReason}</span>
          </InfoBox>
        )}

        {(t.altSize || t.altCondition || t.altQuantity != null || t.altAskingPrice != null || t.altNotes) && (
          <div style={{ background: 'var(--amber-bg, #FFFBEB)', border: '1px solid var(--amber)40', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Alternative Offer</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: t.altNotes ? 8 : 0 }}>
              {t.altSize && <span className="badge b-amber">{t.altSize}</span>}
              {t.altCondition && <span className="badge b-amber">{t.altCondition}</span>}
              {t.altQuantity != null && <span className="badge b-amber">Qty {t.altQuantity}</span>}
              {t.altAskingPrice != null && <span className="badge b-amber">${t.altAskingPrice.toLocaleString()}</span>}
            </div>
            {t.altNotes && <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.5 }}>{t.altNotes}</div>}
          </div>
        )}
      </div>
      <div className="validation-detail-footer">
        <div className="validation-decision-hint"><Ic n={I.warning} size={14} /> Confirm the requested specification and sellable stock before deciding.</div>
        <div className="validation-decision-actions">
          {onReject && <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={onReject} disabled={processing}>Reject with reason</button>}
          {onApprove && <button className="btn btn-primary" onClick={onApprove} disabled={processing}><Ic n={I.check} size={14} /> {processing ? 'Approving…' : 'Approve ticket'}</button>}
        </div>
      </div>
  </section>
)

const InquiryValidation = () => {
  const [revision, setRevision] = useState(0)
  const { data: tickets, loading, loadError } = useInquiryBoard(revision)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'queue' | 'history'>('queue')
  const [historyStatus, setHistoryStatus] = useState('All history')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState('')

  const pics = [...new Set(tickets.map((t: any) => t.pic).filter(Boolean))].sort() as string[]
  const term = search.trim().toLowerCase()
  const searched = tickets.filter((t: any) =>
    (!picFilter || t.pic === picFilter) &&
    (!term || [t.company, t.contact, t.ref, t.size, t.condition, t.location].some(v => String(v).toLowerCase().includes(term)))
  )
  const queue = searched.filter((t: any) => t.status === 'Pending Validation')
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const history = searched.filter((t: any) => t.status !== 'Pending Validation')
    .filter((t: any) => historyStatus === 'All history' || t.status === historyStatus)
  const selected = tickets.find((t: any) => t.id === selectedId)
  const queueIds = queue.map((ticket: any) => ticket.id).join(',')
  const approvedCount = tickets.filter((t: any) => t.status === 'Under Review').length
  const validationRejectedCount = tickets.filter((t: any) => t.status === 'Validation Rejected').length

  useEffect(() => {
    if (view !== 'queue') return
    if (!queue.some((ticket: any) => ticket.id === selectedId)) setSelectedId(queue[0]?.id ?? null)
  }, [view, selectedId, queueIds])

  const approve = async (id: string) => {
    setError('')
    setProcessingId(id)
    try {
      await api.post(`/leads/inquiries/${id}/validate`, { approved: true })
      toast('Inquiry approved and released to Sales for quotation.', 'success')
      setRevision(v => v + 1)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Could not approve this ticket.')
    } finally {
      setProcessingId(null)
    }
  }

  const reject = async (id: string, reason: string, alternative: AlternativeOffer) => {
    setError('')
    try {
      await api.post(`/leads/inquiries/${id}/validate`, {
        approved: false,
        rejectionReason: reason,
        altContainerSizeId: alternative.containerSizeId,
        altContainerConditionId: alternative.containerConditionId,
        altQuantity: alternative.quantity,
        altAskingPrice: alternative.askingPrice,
        altNotes: alternative.notes,
      })
      setRejectingId(null)
      toast('Inquiry returned to Sales with your feedback.', 'success')
      setRevision(v => v + 1)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Could not reject this ticket.')
      throw err
    }
  }

  const rejectingTicket = tickets.find((t: any) => t.id === rejectingId)

  return (
    <div className="page-scroll">
      <div className="page-content validation-page">
        <div className="validation-hero">
          <div>
            <div className="validation-kicker"><span className="sync-dot" /> Procurement workbench</div>
            <h1 className="validation-title">Inquiry validation</h1>
            <p className="validation-subtitle">Review demand against live sellable stock, then release viable inquiries to Sales.</p>
          </div>
          <div className="validation-hero-count"><strong>{queue.length}</strong><span>need a decision</span></div>
        </div>

        <div className="validation-summary-strip">
          <div><span className="summary-dot amber" /><strong>{queue.length}</strong><span>Awaiting Procurement</span></div>
          <div><span className="summary-dot green" /><strong>{approvedCount}</strong><span>Approved / Ready to Quote</span></div>
          <div><span className="summary-dot red" /><strong>{validationRejectedCount}</strong><span>Returned to Sales</span></div>
        </div>

        <div className="validation-controls">
          <div className="validation-view-switch" role="tablist" aria-label="Validation views">
            <button type="button" role="tab" aria-selected={view === 'queue'} className={view === 'queue' ? 'active' : ''} onClick={() => setView('queue')}>Needs validation <span>{queue.length}</span></button>
            <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</button>
          </div>
          <div className="validation-filters">
            <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)} aria-label="Filter by PIC"><option value="">All PICs</option>{pics.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search company, spec, location…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
        </div>

        {(error || loadError) && <div className="validation-error"><Ic n={I.warning} size={14} /> {error || loadError}</div>}

        {view === 'queue' ? (
          <div className="validation-workspace">
            <aside className="validation-queue-panel">
              <div className="validation-panel-heading">
                <div><strong>Decision queue</strong><span>Oldest requests appear first</span></div>
                <span>{queue.length}</span>
              </div>
              <div className="validation-queue-list">
                {loading && tickets.length === 0 ? <div className="validation-empty"><Ic n={I.sync} size={22} /><strong>Loading tickets…</strong></div> : queue.map((ticket: any) => (
                  <ValidationQueueItem key={ticket.id} ticket={ticket} active={ticket.id === selectedId} onSelect={() => setSelectedId(ticket.id)} />
                ))}
                {!loading && queue.length === 0 && (
                  <div className="validation-empty success"><span><Ic n={I.check} size={22} /></span><strong>Queue cleared</strong><p>There are no inquiries waiting for Procurement.</p></div>
                )}
              </div>
            </aside>
            <div className="validation-detail-panel">
              {selected && selected.status === 'Pending Validation' ? (
                <TicketDecisionPanel t={selected} onApprove={() => approve(selected.id)} onReject={() => setRejectingId(selected.id)} processing={processingId === selected.id} />
              ) : (
                <div className="validation-empty"><Ic n={I.inquiry} size={26} /><strong>Select an inquiry</strong><p>Choose a ticket from the queue to inspect its requirements and live stock.</p></div>
              )}
            </div>
          </div>
        ) : (
          <section className="validation-history-card">
            <div className="validation-history-toolbar">
              <div><strong>Decision history</strong><span>Validation outcomes and downstream progress</span></div>
              <select className="sel" value={historyStatus} onChange={e => setHistoryStatus(e.target.value)}>
                {['All history', 'Under Review', 'Validation Rejected', 'Quotation Created', 'Quotation Rejected', 'Converted to Sale'].map(status => <option key={status} value={status}>{validationStatusLabel(status)}</option>)}
              </select>
            </div>
            <div className="validation-history-table-wrap">
              <table className="crm validation-history-table">
                <thead><tr><th>Inquiry</th><th>Company</th><th>Request</th><th>PIC</th><th>Received</th><th>Outcome</th></tr></thead>
                <tbody>
                  {history.map((ticket: any) => (
                    <tr key={ticket.id}>
                      <td><span className="ref-id">{ticket.ref}</span></td>
                      <td><strong>{ticket.company}</strong><small>{ticket.contact}</small></td>
                      <td>{ticket.size} · {ticket.condition}<small>{ticket.quantity} unit{ticket.quantity === 1 ? '' : 's'} · {ticket.location}</small></td>
                      <td><ChipPIC label={ticket.pic} /></td>
                      <td>{ticket.date}</td>
                      <td><span className={`badge ${validationStatusTone(ticket.status)}`}>{validationStatusLabel(ticket.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && history.length === 0 && <div className="validation-empty"><Ic n={I.search} size={22} /><strong>No matching history</strong><p>Try a different PIC, status, or search term.</p></div>}
            </div>
          </section>
        )}
      </div>
      {rejectingTicket && (
        <RejectTicketModal
          ticketRef={rejectingTicket.ref}
          onClose={() => setRejectingId(null)}
          onReject={(reason, alternative) => reject(rejectingTicket.id, reason, alternative)}
        />
      )}
    </div>
  )
}

// ─── Inventory Management ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'In Stock':     { bg: '#D1FAE5', color: '#065F46' },
  'Low Stock':    { bg: '#FEF3C7', color: '#92400E' },
  'Out of Stock': { bg: '#FEE2E2', color: '#991B1B' },
  'Reserved':     { bg: '#EDE9FE', color: '#4C1D95' },
}

const InventoryManagement = ({ role }: { role?: string }) => {
  const [search, setSearch]             = useState('')
  const [sizeFilter, setSizeFilter]     = useState('')
  const [condFilter, setCondFilter]     = useState('')
  const [depotFilter, setDepotFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [revision, setRevision]         = useState(0)
  const [showNew, setShowNew]           = useState(false)
  const [showPaste, setShowPaste]       = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [editRow, setEditRow]           = useState<any>(null)
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState('')

  const filters: Record<string, string> = {}
  if (search)       filters.search              = search
  if (sizeFilter)   filters.container_size      = sizeFilter
  if (condFilter)   filters.container_condition = condFilter
  if (depotFilter)  filters.depot_name          = depotFilter
  if (statusFilter) filters.status              = statusFilter

  const inventory = useInventory(filters, revision)
  const summary   = useInventorySummary(revision)
  const canWrite  = ['admin', 'procurement', 'operations'].includes(role ?? '')
  const refresh   = () => setRevision(r => r + 1)

  const sizes  = [...new Set(inventory.map((r: any) => r.container_size))].filter(Boolean).sort() as string[]
  const conds  = [...new Set(inventory.map((r: any) => r.container_condition))].filter(Boolean).sort() as string[]
  const depots = [...new Set(inventory.map((r: any) => r.depot_name))].filter(Boolean).sort() as string[]

  const handleStockDelta = async (id: string, field: 'available' | 'reserved', delta: number) => {
    try {
      await api.patch(`/inventory/${id}/stock`, {
        delta_available: field === 'available' ? delta : 0,
        delta_reserved:  field === 'reserved'  ? delta : 0,
      })
      refresh()
    } catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to adjust stock', 'error') }
  }

  const handleDelete = async (id: string) => {
    const { confirmed } = await askConfirm({
      title: 'Delete inventory record',
      message: 'Delete this inventory record? This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    try { await api.delete(`/inventory/${id}`); refresh() }
    catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to delete', 'error') }
  }

  // ── New / Edit form ──────────────────────────────────────────────────────
  const InventoryForm = ({ initial, onClose }: { initial?: any; onClose: () => void }) => {
    const isEdit = !!initial?.id
    const [form, setForm] = useState({
      container_size: initial?.container_size || '', container_condition: initial?.container_condition || '',
      container_category: initial?.container_category || 'Dry', vendor_supplier: initial?.vendor_supplier || '',
      depot_name: initial?.depot_name || '', city: initial?.city || '',
      state_province: initial?.state_province || '', country: initial?.country || 'USA',
      quantity_available: initial?.quantity_available ?? 0, quantity_reserved: initial?.quantity_reserved ?? 0,
      unit_cost: initial?.unit_cost ?? 0, target_sell_price: initial?.target_sell_price ?? 0, notes: initial?.notes || '',
    })
    const set = (k: string) => (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value }))
    // Reuse the same container_sizes/container_conditions/container_categories catalog that
    // Inquiries and Quotations already draw from -- the "Live Stock Check" widget on a ticket
    // matches by exact name against this catalog, so inventory has to speak the same
    // vocabulary or that lookup silently never finds a match.
    const SZ = useCatalogList('/catalog/sizes').map(s => s.name)
    const CD = useCatalogList('/catalog/conditions').map(c => c.name)
    const CT = useCatalogList('/catalog/categories').map(c => c.name)
    const handleSubmit = async () => {
      if (!form.container_size || !form.container_condition || !form.depot_name) { setFormError('Size, condition, and depot are required.'); return }
      setSaving(true); setFormError('')
      try {
        const payload = { ...form, quantity_available: Number(form.quantity_available), quantity_reserved: Number(form.quantity_reserved), unit_cost: Number(form.unit_cost), target_sell_price: Number(form.target_sell_price) }
        isEdit ? await api.patch(`/inventory/${initial.id}`, payload) : await api.post('/inventory', payload)
        refresh(); onClose()
      } catch (e: any) { setFormError(e?.response?.data?.error?.message || 'Failed to save') }
      finally { setSaving(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">{isEdit ? 'Edit Inventory Record' : 'Add Inventory'}</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {formError && <div style={{ gridColumn:'1/-1', color:'#DC2626', fontSize:12, padding:'8px 12px', background:'#FEF2F2', borderRadius:7 }}>{formError}</div>}
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Container Size *</label><select className="inp" value={form.container_size} onChange={set('container_size')}><option value="">— Select —</option>{SZ.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><label className="form-label">Condition *</label><select className="inp" value={form.container_condition} onChange={set('container_condition')}><option value="">— Select —</option>{CD.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label className="form-label">Category</label><select className="inp" value={form.container_category} onChange={set('container_category')}>{CT.map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Depot / Yard Name *</label><input className="inp" placeholder="e.g. Long Beach Depot A" value={form.depot_name} onChange={set('depot_name')} /></div>
            <div><label className="form-label">Vendor / Supplier</label><input className="inp" placeholder="e.g. Maersk Surplus" value={form.vendor_supplier} onChange={set('vendor_supplier')} /></div>
            <div><label className="form-label">City</label><input className="inp" value={form.city} onChange={set('city')} /></div>
            <div><label className="form-label">State / Province</label><input className="inp" value={form.state_province} onChange={set('state_province')} /></div>
            <div><label className="form-label">Country</label><input className="inp" value={form.country} onChange={set('country')} /></div>
            <div><label className="form-label">Units Available</label><input className="inp" type="number" min={0} value={form.quantity_available} onChange={set('quantity_available')} /></div>
            <div><label className="form-label">Units Reserved</label><input className="inp" type="number" min={0} value={form.quantity_reserved} onChange={set('quantity_reserved')} /></div>
            <div><label className="form-label">Unit Cost ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.unit_cost} onChange={set('unit_cost')} /></div>
            <div><label className="form-label">Target Sell Price ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.target_sell_price} onChange={set('target_sell_price')} /></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="inp" rows={2} style={{ resize:'vertical' }} value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Inventory'}</button></div>
        </div>
      </div>
    )
  }

  // ── Paste Bulk Modal ─────────────────────────────────────────────────────
  const PasteBulkModal = ({ onClose }: { onClose: () => void }) => {
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMNS = ['container_size','container_condition','depot_name','vendor_supplier','city','state_province','country','quantity_available','unit_cost','target_sell_price']
    const parseText = (raw: string) => raw.trim().split('\n').filter(l=>l.trim()).map(line => {
      const cols = line.split('\t'); const row: any = {}
      COLUMNS.forEach((col, i) => { if (cols[i]) row[col] = cols[i].trim() }); return row
    })
    const rows = parseText(text)
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Paste Bulk from Excel</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)', marginBottom:4 }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626' }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <p style={{ fontSize:12.5, color:'var(--t3)', marginBottom:8 }}>Copy rows from Excel and paste below. Columns (tab-separated):</p>
                <div style={{ fontSize:10.5, fontFamily:'var(--mono)', background:'var(--s3)', padding:'6px 10px', borderRadius:6, marginBottom:12, color:'var(--t3)', wordBreak:'break-all' }}>
                  size | condition | depot | vendor | city | state | country | qty | cost | sell_price
                </div>
                <textarea className="inp" rows={8} style={{ fontFamily:'var(--mono)', fontSize:11, resize:'vertical' }} placeholder="Paste Excel rows here…" value={text} onChange={e => setText(e.target.value)} />
                {rows.length > 0 && <div style={{ fontSize:11, color:'var(--t4)', marginTop:6 }}>{rows.length} rows detected · Preview: {rows[0]?.container_size} | {rows[0]?.depot_name}</div>}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && <button className="btn btn-primary" disabled={!text.trim() || importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  // ── Excel Import Modal ───────────────────────────────────────────────────
  const ExcelImportModal = ({ onClose }: { onClose: () => void }) => {
    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMN_MAP: Record<string, string> = {
      'container size':'container_size','size':'container_size','condition':'container_condition','container condition':'container_condition',
      'depot':'depot_name','depot name':'depot_name','yard':'depot_name','vendor':'vendor_supplier','supplier':'vendor_supplier',
      'city':'city','state':'state_province','state/province':'state_province','country':'country',
      'quantity':'quantity_available','qty':'quantity_available','available':'quantity_available',
      'unit cost':'unit_cost','cost':'unit_cost','buying cost':'unit_cost','sell price':'target_sell_price','target price':'target_sell_price','notes':'notes',
    }
    const handleFile = async (f: File) => {
      setFile(f)
      const XLSX = await import('xlsx')
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type:'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval:'' })
      const mapped = raw.map(row => {
        const out: any = {}
        Object.entries(row).forEach(([k,v]) => { const mk = COLUMN_MAP[k.toLowerCase().trim()]; if (mk) out[mk] = String(v).trim() })
        return out
      }).filter(r => r.container_size || r.depot_name)
      setRows(mapped)
    }
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 600, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Import Excel / CSV</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)' }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <div style={{ border:'2px dashed var(--border)', borderRadius:10, padding:32, textAlign:'center', cursor:'pointer', marginBottom:16 }}
                  onClick={() => document.getElementById('inv-file-input')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
                  <Ic n={I.upload} size={24} style={{ color:'var(--t4)', marginBottom:8 }} />
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t2)' }}>{file ? file.name : 'Drop .xlsx or .csv here, or click to browse'}</div>
                  <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>Columns are auto-detected from the header row</div>
                  <input id="inv-file-input" type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                </div>
                {rows.length > 0 && (
                  <div style={{ fontSize:11, fontFamily:'var(--mono)', background:'var(--s3)', borderRadius:6, padding:8 }}>
                    <div style={{ fontWeight:600, color:'var(--t4)', marginBottom:4 }}>{rows.length} rows detected — preview:</div>
                    {rows.slice(0,3).map((row,i) => <div key={i} style={{ padding:'2px 0', borderBottom:'1px solid var(--border-s)' }}>{row.container_size} | {row.container_condition} | {row.depot_name} | Qty: {row.quantity_available||0}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && rows.length > 0 && <button className="btn btn-primary" disabled={importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-scroll">
      {showNew    && <InventoryForm onClose={() => { setShowNew(false); setFormError('') }} />}
      {editRow    && <InventoryForm initial={editRow} onClose={() => { setEditRow(null); setFormError('') }} />}
      {showPaste  && <PasteBulkModal onClose={() => setShowPaste(false)} />}
      {showImport && <ExcelImportModal onClose={() => setShowImport(false)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Inventory Management</div>
          <div className="page-desc">Track container stock across all depots and vendors.</div>
        </div>
        {canWrite && (
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" sm onClick={() => setShowImport(true)}><Ic n={I.upload} size={13} /> Import Excel</Btn>
            <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>
            <Btn variant="primary" sm onClick={() => setShowNew(true)}><Ic n={I.plus} size={13} /> Add Inventory</Btn>
          </div>
        )}
      </div>

      <div style={{ padding:'0 24px 16px', display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12 }}>
        {[
          { label:'Total Records',   val: summary?.total_records    ?? 0, color:'var(--t1)' },
          { label:'Units Available', val: summary?.total_available  ?? 0, color:'var(--green)' },
          { label:'Units Reserved',  val: summary?.total_reserved   ?? 0, color:'var(--amber)' },
          { label:'Active Depots',   val: summary?.active_depots    ?? 0, color:'var(--brand)' },
          { label:'Low / Out Stock', val: `${summary?.low_stock_count ?? 0} / ${summary?.out_of_stock_count ?? 0}`, color:'#DC2626' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search size, condition, depot, vendor…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={sizeFilter}   onChange={e => setSizeFilter(e.target.value)}><option value="">All Sizes</option>{sizes.map(s=><option key={s}>{s}</option>)}</select>
        <select className="sel" value={condFilter}   onChange={e => setCondFilter(e.target.value)}><option value="">All Conditions</option>{conds.map(c=><option key={c}>{c}</option>)}</select>
        <select className="sel" value={depotFilter}  onChange={e => setDepotFilter(e.target.value)}><option value="">All Depots</option>{depots.map(d=><option key={d}>{d}</option>)}</select>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option><option>Reserved</option></select>
        <div className="toolbar-right">
          <span className="count-label">{inventory.length} records</span>
          <ExportMenu data={inventory} filename="inventory" />
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 24px' }}>
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="crm">
            <thead><tr>
              <th>Container Spec</th><th>Condition</th><th>Depot / Yard</th><th>Vendor</th>
              <th className="r">Available</th><th className="r">Reserved</th>
              <th className="r">Unit Cost</th><th className="r">Target Price</th>
              <th>Status</th>{canWrite && <th>Actions</th>}
            </tr></thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={canWrite ? 10 : 9} style={{ textAlign:'center', padding:40, color:'var(--t4)' }}>
                  No inventory records found.{canWrite ? ' Click "Add Inventory" or import a vendor sheet to get started.' : ''}
                </td></tr>
              ) : inventory.map((row: any) => {
                const sc = STATUS_COLORS[row.status] || { bg:'var(--s3)', color:'var(--t3)' }
                return (
                  <tr key={row.id}>
                    <td><div style={{ fontWeight:600, fontSize:13 }}>{row.container_size}</div><div style={{ fontSize:11, color:'var(--t4)' }}>{row.container_category}</div></td>
                    <td style={{ fontSize:12.5 }}>{row.container_condition}</td>
                    <td><div style={{ fontWeight:500, fontSize:13 }}>{row.depot_name}</div>{(row.city||row.state_province) && <div style={{ fontSize:11, color:'var(--t4)' }}>{[row.city,row.state_province,row.country].filter(Boolean).join(', ')}</div>}</td>
                    <td style={{ fontSize:12.5, color:'var(--t3)' }}>{row.vendor_supplier||'—'}</td>
                    <td className="r">
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',-1)}>−</button>}
                        <span style={{ fontWeight:700, fontFamily:'var(--mono)', minWidth:24, textAlign:'center' }}>{row.quantity_available}</span>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',1)}>+</button>}
                      </div>
                    </td>
                    <td className="r mono">{row.quantity_reserved}</td>
                    <td className="r mono">${Number(row.unit_cost).toLocaleString()}</td>
                    <td className="r mono">${Number(row.target_sell_price||0).toLocaleString()}</td>
                    <td><span style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600, background:sc.bg, color:sc.color }}>{row.status}</span></td>
                    {canWrite && <td><div style={{ display:'flex', gap:4 }}><Btn variant="ghost" sm title="Edit" onClick={() => setEditRow(row)}><Ic n={I.edit} size={13} /></Btn>{role==='admin' && <Btn variant="ghost" sm title="Delete" onClick={() => handleDelete(row.id)}><Ic n={I.removed} size={13} /></Btn>}</div></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

const money = (n: any) => `$${Math.round(Number(n) || 0).toLocaleString()}`
const num = (n: any) => (Number(n) || 0).toLocaleString()

// Shapes the report into the flat tables used by every export format, so the
// Excel workbook, the Google Sheet and the on-screen document never drift apart.
const reportTabs = (r: any) => {
  const s = r.summary || {}, p = r.pipeline || {}, o = r.outreach || {}, t = r.targets || {}
  return [
    {
      name: 'Summary',
      rows: [
        { Metric: 'Revenue',              Value: Number(s.revenue) || 0 },
        { Metric: 'Buying cost',          Value: Number(s.buying_cost) || 0 },
        { Metric: 'Gross profit',         Value: Number(s.gross_profit) || 0 },
        { Metric: 'Profit margin %',      Value: Number(s.margin) || 0 },
        { Metric: 'Units sold',           Value: Number(s.units) || 0 },
        { Metric: 'Deals won',            Value: Number(s.deals_won) || 0 },
        { Metric: 'Average deal size',    Value: Number(s.avg_deal) || 0 },
        { Metric: 'Previous month profit', Value: Number(s.prev_gross_profit) || 0 },
        { Metric: 'Profit change %',      Value: s.profit_change_pct ?? 'n/a' },
        { Metric: 'Gross profit target',  Value: Number(t.monthly_gross_profit_target) || 0 },
      ],
    },
    {
      name: 'Pipeline',
      rows: [
        { Stage: 'New prospects',  Count: Number(p.prospects) || 0 },
        { Stage: 'Warm leads',     Count: Number(p.warm_leads) || 0 },
        { Stage: 'Inquiries',      Count: Number(p.inquiries) || 0 },
        { Stage: 'Quotations',     Count: Number(p.quotations) || 0 },
        { Stage: 'Sales won',      Count: Number(p.sales) || 0 },
      ],
    },
    {
      name: 'Outreach',
      rows: [
        { Channel: 'Emails sent',    Completed: Number(o.emails) || 0, Target: Number(t.monthly_email_target) || 0, Replies: Number(o.email_replies) || 0 },
        { Channel: 'Calls made',     Completed: Number(o.calls) || 0,  Target: Number(t.monthly_call_target) || 0,  Replies: Number(o.calls_answered) || 0 },
        { Channel: 'Texts sent',     Completed: Number(o.texts) || 0,  Target: Number(t.monthly_text_target) || 0,  Replies: Number(o.text_replies) || 0 },
        { Channel: 'Days logged',    Completed: Number(o.days_logged) || 0, Target: Number(t.working_days_per_month) || 0, Replies: '' },
      ],
    },
    {
      name: 'PIC Breakdown',
      rows: (r.pic_breakdown || []).map((x: any) => ({
        PIC: x.name, Deals: x.deals, Units: x.units,
        Revenue: Number(x.revenue) || 0, 'Gross profit': Number(x.gross_profit) || 0,
        Emails: x.emails, Calls: x.calls, Texts: x.texts,
      })),
    },
    {
      name: 'Top Customers',
      rows: (r.top_customers || []).map((x: any) => ({
        Company: x.company, Deals: x.deals, Units: x.units,
        Revenue: Number(x.revenue) || 0, 'Gross profit': Number(x.gross_profit) || 0,
      })),
    },
    {
      name: 'Loss Reasons',
      rows: (r.loss_reasons || []).map((x: any) => ({ Reason: x.reason, Count: x.count })),
    },
  ]
}

const MonthlyReport = () => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/monthly', { params: { month } })
      .then(res => { if (res.data.success) setReport(res.data.data) })
      .catch(e => toast(e.response?.data?.error?.message ?? 'Could not load the report.', 'error'))
      .finally(() => setLoading(false))
  }, [month])

  const filename = report ? `Monthly Report ${report.month_label}` : 'Monthly Report'

  const exportExcel = async () => {
    if (!report) return
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const tab of reportTabs(report)) {
        if (!tab.rows.length) continue
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tab.rows), tab.name)
      }
      XLSX.writeFile(wb, `${filename}.xlsx`)
    } catch {
      toast('Could not build the Excel file.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const exportSheet = async () => {
    if (!report) return
    setExporting(true)
    toast('Creating your Google Sheet…', 'info')
    try {
      const res = await api.post('/export/google-workbook', { title: filename, tabs: reportTabs(report) })
      const url = res.data.data?.url
      if (url) {
        window.open(url, '_blank', 'noopener')
        toast(`Sheet created with ${res.data.data.tabs} tabs.`, 'success')
      }
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Google Sheets export failed.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // Same tabular document as every other PDF export, driven by the exact sections
  // the Excel and Google Sheets exports use -- so all three stay identical.
  const exportPDF = () => void downloadPdfDocument({
    title: 'MONTHLY PERFORMANCE REPORT',
    filename,
    scope: `Container CRM | ${report.month_label} | ${report.scope === 'personal' ? 'Personal' : 'Organization-wide'}`,
    sections: reportTabs(report).map(t => ({ title: t.name, rows: t.rows })),
  })

  if (loading) return <div className="loading-row"><span className="spinner" />Building report…</div>
  if (!report) return <div className="empty"><div className="empty-title">No report available</div></div>

  const s = report.summary || {}, p = report.pipeline || {}, o = report.outreach || {}, t = report.targets || {}
  const profitTarget = Number(t.monthly_gross_profit_target) || 0
  const profitPct = profitTarget > 0 ? Math.round((Number(s.gross_profit) / profitTarget) * 100) : null
  const change = s.profit_change_pct

  const exportOptions = [
    { label: 'PDF',           run: exportPDF },
    { label: 'Excel (.xlsx)', run: exportExcel },
    { label: 'Google Sheet',  run: exportSheet },
  ]

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card report-block" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div className="page-scroll">
      <div className="page-header no-print">
        <div>
          <div className="page-title">Monthly Report</div>
          <div className="page-desc">
            {report.scope === 'personal' ? 'Your own figures' : 'Organization-wide'} · generated {new Date(report.generated_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="inp sm" type="month" value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ width: 160 }}
          />
          <div style={{ position: 'relative' }}>
            <Btn variant="primary" sm onClick={() => setMenuOpen(o => !o)} disabled={exporting}>
              <Ic n={I.export} size={13} /> {exporting ? 'Exporting…' : 'Export'} <Ic n={I.chevDown} size={11} />
            </Btn>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 170, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
                  {exportOptions.map(opt => (
                    <div
                      key={opt.label}
                      onClick={() => { setMenuOpen(false); opt.run() }}
                      style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--t2)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-content report-sheet">
        {/* Print-only masthead -- the app chrome is hidden on paper, so the document
            needs to identify itself. */}
        <div className="print-only report-masthead">
          <div style={{ fontSize: 20, fontWeight: 800 }}>Container CRM — Monthly Report</div>
          <div style={{ fontSize: 13, color: '#555' }}>
            {report.month_label} · {report.scope === 'personal' ? 'Personal figures' : 'Organization-wide'} · generated {new Date(report.generated_at).toLocaleDateString()}
          </div>
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', marginBottom: 12 }}>{report.month_label}</div>

        {/* Headline numbers */}
        <div className="report-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'Revenue',      val: money(s.revenue),      color: 'var(--brand)' },
            { label: 'Buying cost',  val: money(s.buying_cost),  color: 'var(--t3)' },
            { label: 'Gross profit', val: money(s.gross_profit), color: 'var(--green)' },
            { label: 'Margin',       val: `${Number(s.margin) || 0}%`, color: 'var(--teal)' },
          ].map(k => (
            <div key={k.label} className="kpi-card report-block">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        <Section title="Performance against target">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { k: 'Deals won', v: num(s.deals_won) },
              { k: 'Units sold', v: num(s.units) },
              { k: 'Average deal', v: money(s.avg_deal) },
              {
                k: 'vs last month',
                v: change === null || change === undefined ? '—' : `${change > 0 ? '+' : ''}${change}%`,
                color: change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : undefined,
              },
            ].map(x => (
              <div key={x.k}>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>{x.k}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (x as any).color || 'var(--t1)' }}>{x.v}</div>
              </div>
            ))}
          </div>
          {profitTarget > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)', marginBottom: 5 }}>
                <span>Gross profit target</span>
                <span>{money(s.gross_profit)} of {money(profitTarget)} · {profitPct}%</span>
              </div>
              <div className="prog"><div className="prog-fill" style={{ width: `${Math.min(100, profitPct ?? 0)}%`, background: (profitPct ?? 0) >= 100 ? 'var(--green)' : 'var(--brand)' }} /></div>
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--t4)' }}>
              No profit target configured — set one in Daily Targets to track progress here.
            </div>
          )}
        </Section>

        <Section title="Pipeline created this month">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[
              { k: 'Prospects', v: p.prospects }, { k: 'Warm leads', v: p.warm_leads },
              { k: 'Inquiries', v: p.inquiries }, { k: 'Quotations', v: p.quotations },
              { k: 'Sales won', v: p.sales },
            ].map(x => (
              <div key={x.k} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--s2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>{num(x.v)}</div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{x.k}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Outreach activity">
          {Number(o.days_logged) === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--t4)' }}>
              No outreach was logged for this month. Activity is recorded on the Daily Tasks screen.
            </div>
          ) : (
            <table className="crm">
              <thead><tr><th>Channel</th><th className="r">Completed</th><th className="r">Target</th><th className="r">Replies / Answered</th><th className="r">Completion</th></tr></thead>
              <tbody>
                {[
                  { c: 'Emails', done: o.emails, tgt: t.monthly_email_target, rep: o.email_replies },
                  { c: 'Calls',  done: o.calls,  tgt: t.monthly_call_target,  rep: o.calls_answered },
                  { c: 'Texts',  done: o.texts,  tgt: t.monthly_text_target,  rep: o.text_replies },
                ].map(r => {
                  const pct = Number(r.tgt) > 0 ? Math.round((Number(r.done) / Number(r.tgt)) * 100) : null
                  return (
                    <tr key={r.c}>
                      <td style={{ fontWeight: 600 }}>{r.c}</td>
                      <td className="r mono">{num(r.done)}</td>
                      <td className="r mono">{Number(r.tgt) > 0 ? num(r.tgt) : '—'}</td>
                      <td className="r mono">{num(r.rep)}</td>
                      <td className="r mono" style={{ color: pct === null ? 'var(--t4)' : pct >= 100 ? 'var(--green)' : 'var(--t2)' }}>
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {(report.pic_breakdown || []).length > 0 && (
          <Section title="Performance by PIC">
            <table className="crm">
              <thead><tr>
                <th>PIC</th><th className="r">Deals</th><th className="r">Units</th>
                <th className="r">Revenue</th><th className="r">Gross profit</th>
                <th className="r">Emails</th><th className="r">Calls</th><th className="r">Texts</th>
              </tr></thead>
              <tbody>
                {report.pic_breakdown.map((x: any) => (
                  <tr key={x.name}>
                    <td style={{ fontWeight: 600 }}>{x.name}</td>
                    <td className="r mono">{num(x.deals)}</td>
                    <td className="r mono">{num(x.units)}</td>
                    <td className="r mono">{money(x.revenue)}</td>
                    <td className="r mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{money(x.gross_profit)}</td>
                    <td className="r mono">{num(x.emails)}</td>
                    <td className="r mono">{num(x.calls)}</td>
                    <td className="r mono">{num(x.texts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {(report.top_customers || []).length > 0 && (
          <Section title="Top customers by gross profit">
            <table className="crm">
              <thead><tr><th>Company</th><th className="r">Deals</th><th className="r">Units</th><th className="r">Revenue</th><th className="r">Gross profit</th></tr></thead>
              <tbody>
                {report.top_customers.map((x: any) => (
                  <tr key={x.company}>
                    <td style={{ fontWeight: 600 }}>{x.company}</td>
                    <td className="r mono">{num(x.deals)}</td>
                    <td className="r mono">{num(x.units)}</td>
                    <td className="r mono">{money(x.revenue)}</td>
                    <td className="r mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{money(x.gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {(report.loss_reasons || []).length > 0 && (
          <Section title="Why inquiries were lost">
            <table className="crm">
              <thead><tr><th>Reason</th><th className="r">Count</th></tr></thead>
              <tbody>
                {report.loss_reasons.map((x: any) => (
                  <tr key={x.reason}>
                    <td>{x.reason}</td>
                    <td className="r mono" style={{ fontWeight: 700 }}>{num(x.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </div>
  )
}

// ─── Admin pages ──────────────────────────────────────────────────────────────

const TARGET_FIELDS: { key: string; label: string; section: string }[] = [
  { key: 'monthly_gross_profit_target', label: 'Monthly Gross Profit Target ($)', section: 'Monthly Targets' },
  { key: 'working_days_per_month',      label: 'Working Days per Month',          section: 'Monthly Targets' },
  { key: 'daily_email_target',          label: 'Daily Email Target',              section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_min',       label: 'Daily Call Target (Minimum)',     section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_preferred', label: 'Daily Call Target (Preferred)',   section: 'Daily Outreach Targets' },
  { key: 'daily_text_target',           label: 'Daily Text Target',               section: 'Daily Outreach Targets' },
]

const DailyTargets = () => {
  const [form, setForm] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setForm(res.data.data || {}) })
      .catch(() => toast('Could not load targets.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload = Object.fromEntries(TARGET_FIELDS.map(f => [f.key, Number(form[f.key]) || 0]))
      const res = await api.patch('/settings/targets', payload)
      setForm(res.data.data || form)
      toast('Targets saved. Dashboards will use these going forward.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save targets.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading targets…</div>

  let lastSection = ''
  return (
    <div className="page-scroll">
      <div className="page-content" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="page-title">Daily Targets Configuration</div>
          <div className="page-desc">Set the outreach and profit targets used across dashboards and reports.</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {TARGET_FIELDS.map(f => {
            const header = f.section !== lastSection ? (lastSection = f.section) : null
            return (
              <div key={f.key}>
                {header && <div className="form-section">{header}</div>}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">{f.label}</label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] ?? 0}
                    onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  />
                </div>
              </div>
            )
          })}
          <Btn variant="primary" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
            <Ic n={I.check} size={14} /> {saving ? 'Saving…' : 'Save Targets'}
          </Btn>
        </div>
      </div>
    </div>
  )
}


const ServiceTerritories = () => {
  const [rows, setRows] = useState<Territory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/territories')
      .then(res => { if (res.data.success) setRows(res.data.data || []) })
      .catch(() => toast('Could not load territories.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patch('/settings/territories', {
        territories: rows.map(r => ({ id: r.id, enabled: r.enabled })),
      })
      setRows(res.data.data || rows)
      toast('Service territories updated.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save territories.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading territories…</div>

  const regions = [...new Set(rows.map(r => r.region))]
  const palette: Record<string, { color: string; bg: string }> = {
    'Northern United States': { color: 'var(--brand)', bg: 'var(--brand-bg)' },
    'Canadian Provinces':     { color: 'var(--green)', bg: 'var(--green-bg)' },
  }

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Service Territory Settings</div>
            <div className="page-desc">Click a state or province to enable or disable it, then save.</div>
          </div>
          <Btn variant="primary" sm onClick={save} disabled={saving}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {regions.map(region => {
            const tone = palette[region] ?? { color: 'var(--purple)', bg: 'var(--purple-bg)' }
            const inRegion = rows.filter(r => r.region === region)
            return (
              <div key={region} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{region}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{inRegion.filter(r => r.enabled).length} of {inRegion.length} active</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {inRegion.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid transparent',
                        background: t.enabled ? tone.bg : 'var(--s3)',
                        color: t.enabled ? tone.color : 'var(--t4)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                        textDecoration: t.enabled ? 'none' : 'line-through',
                      }}
                    >
                      {t.enabled ? '✓' : '○'} {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


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

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).has('google_sync') ? 'system-settings' : 'dashboard'
  )
  const [sidebarPinned, setSidebarPinnedState] = useState<boolean>(() => {
    const stored = localStorage.getItem('sidebarMode')
    return stored ? stored === 'expanded' : true
  })
  const setSidebarPinned = (pinned: boolean) => {
    localStorage.setItem('sidebarMode', pinned ? 'expanded' : 'collapsed')
    setSidebarPinnedState(pinned)
  }
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const [session, setSession] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<{ role?: string } | null>(null)

  useEffect(() => {
    if (!session) { setCurrentProfile(null); return }
    api.get('/auth/me').then(res => {
      const p = res.data.data
      setCurrentProfile(p)
      if (p?.role === 'operations') {
        setScreen(s => s === 'dashboard' ? 'pickups' : s)
      } else if (p?.role === 'procurement') {
        setScreen(s => s === 'dashboard' ? 'inquiry-validation' : s)
      }
    }).catch(console.error)
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
      setAuthChecking(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Clicking a "reset password" email link redirects back here with a temporary session
      // and this event -- show the set-new-password screen instead of dropping the user
      // straight into the app on whatever page they land on.
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleNav = useCallback((s: Screen) => setScreen(s), [])

  if (authChecking) return null;
  if (isPasswordRecovery) return (
    <>
      <Suspense fallback={<div className="loading-row"><span className="spinner" />Loading…</div>}>
        <ResetPassword onDone={() => setIsPasswordRecovery(false)} />
      </Suspense>
      <ToastHost />
    </>
  );
  if (!session) return <><Login onLogin={() => {}} /><ToastHost /></>;

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':           return <Dashboard onNav={handleNav} session={session} />
      case 'outreach-dashboard':  return <OutreachDashboard />
      case 'inquiry-dashboard':   return <InquiryDashboard />
      case 'prospects':           return <ProspectSheet mode="prospect" onNav={handleNav} />
      case 'warm-leads':          return <ProspectSheet mode="warm" onNav={handleNav} />
      case 'inquiries':           return <InquiryList />
      case 'quotations':          return <QuotationList />
      case 'sales-tracker':       return <SalesTracker />
      case 'customers':           return <CustomerAccounts />
      case 'contact-outreach':    return <ContactOutreach />
      case 'contracts':           return <Contracts />
      case 'daily-tasks':         return <DailyTasks />
      case 'removed':             return <RemovedSheet />
      case 'deliverability':      return <Deliverability />
      case 'container-catalog':   return <ContainerCatalog />
      case 'pic-performance':     return <PICPerformance />
      case 'profit-analytics':    return <ProfitAnalytics />
      case 'daily-targets':       return <DailyTargets />
      case 'service-territories': return <ServiceTerritories />
      case 'system-settings':     return <SystemSettings onNav={handleNav} />
      case 'profile-settings':    return <UserProfileSettings session={session} />
      case 'user-management':     return currentProfile?.role === 'admin' ? <UserManagement /> : <Dashboard onNav={handleNav} session={session} />
      case 'inquiry-validation':  return ['admin', 'procurement'].includes(currentProfile?.role ?? '') ? <InquiryValidation /> : <Dashboard onNav={handleNav} session={session} />
      case 'inventory-management': return <InventoryManagement role={currentProfile?.role} />
      case 'pickups':             return <Pickups />
      case 'best-clients':        return <BestClients />
      case 'inquiry-funnel':      return <InquiryFunnel />
      case 'monthly-report':     return <MonthlyReport />
      default:                    return <Dashboard onNav={handleNav} session={session} />
    }
  }

  // Pinned = always expanded. Unpinned = collapsed rail that peeks open on hover,
  // so users still get quick access without needing a click every time.
  const isSidebarExpanded = sidebarPinned || isHoveringSidebar

  return (
    <div data-theme={isDark ? 'dark' : undefined} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>

      {/* Physical spacer for layout so it doesn't push when hovering */}
      <div style={{
        width: sidebarPinned ? 240 : 68,
        minWidth: sidebarPinned ? 240 : 68,
        flexShrink: 0,
        transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }} />

      {/* Floating Sidebar */}
      <div
        onMouseEnter={() => setIsHoveringSidebar(true)}
        onMouseLeave={() => setIsHoveringSidebar(false)}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 90, display: 'flex' }}
      >
        <Sidebar
          active={screen}
          onNav={handleNav}
          expanded={isSidebarExpanded}
          pinned={sidebarPinned}
          onTogglePin={() => setSidebarPinned(!sidebarPinned)}
          role={currentProfile?.role}
        />
      </div>

      <div className="workspace" style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <div className="ws-card">
          <TopBar isDark={isDark} onToggleDark={() => setIsDark(d => !d)} session={session} onNav={handleNav} role={currentProfile?.role} />
          <div key={screen} className="screen-transition">
            <Suspense fallback={<div className="loading-row"><span className="spinner" />Loading…</div>}>
              {renderScreen()}
            </Suspense>
          </div>
        </div>
      </div>
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}

// ─── Pickup Tracking ──────────────────────────────────────────────────────────

const Pickups = () => {
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [pickupDates, setPickupDates] = useState<Record<string, string>>({});
  const contracts = useContracts('All Statuses', pickStatus, search, revision);

  const handleUpdateStatus = async (contract: any, newStatus: string) => {
    try {
      const date = pickupDates[contract.id] ?? contract.pickupDateRaw;
      await api.patch(`/contracts/${contract.id}`, {
        pickup_status: newStatus,
        ...(date ? { pickup_date: new Date(`${date}T12:00:00`).toISOString() } : {}),
      });
      setRevision(r => r + 1);
      toast(`Pickup marked ${newStatus}`, 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update status', 'error');
    }
  };

  const pickupTransitions: Record<string, string[]> = {
    Pending: ['Scheduled'],
    Scheduled: ['Pending', 'Confirmed'],
    Confirmed: ['Scheduled', 'Picked Up'],
  };
  const savePickupDate = async (contract: any) => {
    const date = pickupDates[contract.id];
    if (!date) return;
    try {
      await api.patch(`/contracts/${contract.id}`, { pickup_date: new Date(`${date}T12:00:00`).toISOString() });
      toast('Pickup date saved', 'success');
      setRevision(value => value + 1);
    } catch (error: any) {
      toast(error.response?.data?.error?.message ?? 'Pickup date could not be saved', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Pickup Tracking</div>
          <div className="page-desc">Manage container dispatch and warehouse fulfillment.</div>
        </div>
      </div>
      
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search pickups…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={pickStatus} onChange={e => setPickStatus(e.target.value)}>
          <option>All Pickup Statuses</option>
          <option>Pending</option>
          <option>Scheduled</option>
          <option>Confirmed</option>
          <option>Picked Up</option>
          <option>Overdue</option>
        </select>
        <div className="toolbar-right">
          <span className="count-label">{contracts.length} pickups</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Contract #</th><th>Company</th><th>Container</th><th className="r">Qty</th>
            <th>Target Date</th><th>Status</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id} style={{ background: c.pickStatus === 'Overdue' ? 'var(--red-bg)' : undefined }}>
                <td><span className="ref-id" style={{ color: 'var(--teal)' }}>{c.ref}</span></td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{c.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{c.contact}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{c.size}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.category}</div>
                </td>
                <td className="r" style={{ fontWeight: 600 }}>{c.qty}</td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="date" className="inp" aria-label={`Pickup date for ${c.ref}`} value={pickupDates[c.id] ?? c.pickupDateRaw} onChange={e => setPickupDates(values => ({ ...values, [c.id]: e.target.value }))} disabled={c.storedPickStatus === 'Picked Up'} style={{ minWidth: 132, padding: '5px 7px', fontSize: 11 }} />{pickupDates[c.id] && pickupDates[c.id] !== c.pickupDateRaw && <Btn variant="ghost" sm onClick={() => savePickupDate(c)}>Save</Btn>}</div></td>
                <td>
                  <span className={`badge ${c.pickStatus === 'Picked Up' ? 'b-green' : c.pickStatus === 'Overdue' ? 'b-red' : c.pickStatus === 'Confirmed' ? 'b-brand' : 'b-amber'}`}>
                    {c.pickStatus}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--t2)' }}>{c.pic}</td>
                <td className="col-actions">
                  <select 
                    className="sel" 
                    value=""
                    aria-label={`Update ${c.ref} pickup status`}
                    onChange={e => { if (e.target.value) handleUpdateStatus(c, e.target.value) }}
                    disabled={(pickupTransitions[c.storedPickStatus] || []).length === 0}
                    style={{ padding: '4px 8px', fontSize: 11, minWidth: 110 }}
                  >
                    <option value="">Next step…</option>
                    {(pickupTransitions[c.storedPickStatus] || []).map(next => <option key={next} value={next}>{next}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
