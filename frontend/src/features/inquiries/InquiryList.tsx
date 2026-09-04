import React, { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import { NewInquiryDialog, QuotationDialog, type InquiryOption, type WarmLeadOption } from '../pipeline/PipelineDialogs'
import { useInquiries } from '../../hooks/useInquiries'
import { useWarmLeads } from '../../hooks/useWarmLeads'

const InquiryList = () => {
  const [revision, setRevision] = useState(0)
  const [showNewInquiry, setShowNewInquiry] = useState(false)
  const [quotationInquiryId, setQuotationInquiryId] = useState<string | null>(null)
  const [viewRow, setViewRow] = useState<any>(null)
  const INQUIRIES = useInquiries(revision)
  const warmLeads = useWarmLeads(revision)
  const [tab, setTab] = useState('All')
  const [lookup, setLookup] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colField: string; colLabel: string } | null>(null);
  // These match the real inquiry.status values the backend actually sets (see
  // 031_inquiry_ticketing_and_notifications.sql) -- not a larger aspirational list.
  const tabs = ['All', 'Pending Validation', 'Under Review', 'Validation Rejected']
  const [channel, setChannel] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const pics = [...new Set(INQUIRIES.map(r => r.pic).filter(Boolean))].sort() as string[]
  const [actionError, setActionError] = useState('')
  const [addingWarmLeadId, setAddingWarmLeadId] = useState<string | null>(null)

  const applyAlternative = async (id: string) => {
    setActionError('')
    try {
      await api.post(`/leads/inquiries/${id}/apply-alternative`)
      setRevision(v => v + 1)
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message ?? 'Could not apply the alternative offer.')
    }
  }

  const addToWarmLeads = async (id: string) => {
    setActionError('')
    setAddingWarmLeadId(id)
    try {
      await api.post(`/leads/inquiries/${id}/add-to-warm-leads`)
      toast('Inquiry added to Warm Leads.', 'success')
      setRevision(value => value + 1)
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message ?? 'Could not add the inquiry to Warm Leads.')
    } finally {
      setAddingWarmLeadId(null)
    }
  }

  const filtered = INQUIRIES.filter(r => {
    const tabMatch = tab === 'All' || r.status === tab
    const term = lookup.trim().toLowerCase()
    const channelMatch = !channel || r.channel === channel
    const picMatch = !picFilter || r.pic === picFilter
    // Phone matching ignores formatting so "2065550088" finds "+1-206-555-0088".
    const digits = term.replace(/\D/g, '')
    const phoneMatch = digits.length >= 4 && String(r.phone).replace(/\D/g, '').includes(digits)
    return tabMatch && channelMatch && picMatch && (!term
      || phoneMatch
      || [r.company, r.contact, r.ref, r.category, r.phone, r.email].some(value => String(value).toLowerCase().includes(term)))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showNewInquiry && (
        <NewInquiryDialog
          warmLeads={warmLeads as WarmLeadOption[]}
          initialIdentity={lookup.trim() || undefined}
          onClose={() => setShowNewInquiry(false)}
          onSaved={() => { setShowNewInquiry(false); setRevision(value => value + 1); }}
        />
      )}
      {quotationInquiryId && (
        <QuotationDialog
          inquiries={INQUIRIES as InquiryOption[]}
          initialId={quotationInquiryId}
          onClose={() => setQuotationInquiryId(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {/* Lookup bar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', background: 'var(--ws)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Quick Contact Lookup</div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
          <input className="inp sm" placeholder="Enter phone number, email, company or ref…" value={lookup} onChange={e => setLookup(e.target.value)} style={{ flex: 1 }} />
          {lookup.trim() && <Btn variant="secondary" sm onClick={() => setLookup('')}><Ic n={I.x} size={13} /> Clear</Btn>}
          <Btn variant="primary" sm onClick={() => setShowNewInquiry(true)}><Ic n={I.plus} size={13} /> New Inquiry</Btn>
        </div>
        {lookup.trim() && (
          <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 6 }}>
            {filtered.length === 0 ? 'No inquiries match that contact.' : `${filtered.length} matching ${filtered.length === 1 ? 'inquiry' : 'inquiries'}`}
          </div>
        )}
      </div>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 20px', flexShrink: 0, background: 'var(--ws)', borderBottom: '1px solid var(--border-s)' }}>
        {[
          { label: 'Pending Validation', val: INQUIRIES.filter(r => r.status === 'Pending Validation').length, icon: I.warning, color: '#D97706' },
          { label: 'Approved / Under Review', val: INQUIRIES.filter(r => r.status === 'Under Review').length, icon: I.check, color: '#315EF6' },
          { label: 'Validation Rejected', val: INQUIRIES.filter(r => r.status === 'Validation Rejected').length, icon: I.x, color: '#DC2626' },
          { label: 'Quotation Rejected', val: INQUIRIES.filter(r => r.status === 'Quotation Rejected').length, icon: I.x, color: '#EA580C' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic n={s.icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-field">
          <Ic n={I.search} size={13} />
          <input placeholder="Search inquiries…" value={lookup} onChange={e => setLookup(e.target.value)} />
        </div>
        <select className="sel" value={channel} onChange={e => setChannel(e.target.value)}><option value="">All Channels</option><option value="Email">Email</option><option value="Direct">Direct</option></select>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{pics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <div className="toolbar-right">
          <span className="count-label">{filtered.length} inquiries</span>
          <ExportMenu data={filtered} filename="inquiries" />
        </div>
      </div>
      {actionError && <div style={{ margin: '0 20px 10px', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}

      {/* Table */}
      <div className="table-wrap">
        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160 }}>
              <div 
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => {
                  const dataToCopy = filtered.map((r: any) => r[contextMenu.colField]).filter(Boolean).join('\n');
                  navigator.clipboard.writeText(dataToCopy);
                  setContextMenu(null);
                  toast(`Copied ${filtered.map((r: any) => r[contextMenu.colField]).filter(Boolean).length} ${contextMenu.colLabel.toLowerCase()}.`, 'success');
                }}
              >
                <Ic n={I.copy} size={14} style={{ color: 'var(--brand)' }} />
                Copy Column ({contextMenu.colLabel})
              </div>
            </div>
          </>
        )}
        <table className="crm">
          <thead>
            <tr>
              <th>Inquiry #</th><th>Date / Time</th><th>Channel</th>
              <th 
                style={{ cursor: 'context-menu' }} 
                title="Right-click to copy all companies"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: 'company', colLabel: 'Companies' });
                }}
              >Company</th>
              <th 
                style={{ cursor: 'context-menu' }} 
                title="Right-click to copy all contacts"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: 'contact', colLabel: 'Contacts' });
                }}
              >Contact</th>
              <th>Category</th><th>Size</th><th className="r">Qty</th><th>Needed By</th><th>Entry Path</th><th>Status</th><th>PIC</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.ref}>
                <td><span className="ref-id">{row.ref}</span></td>
                <td>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{row.date}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{row.time}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                    <Ic n={( { Phone: I.phone, Email: I.mail, SMS: I.inquiry, RingCentral: I.phone } as Record<string, string>)[String(row.channel)] || I.inquiry} size={12} style={{ color: 'var(--t3)' }} />
                    {row.channel}
                  </div>
                </td>
                <td style={{ fontWeight: 600, fontSize: 12.5 }}>{row.company}</td>
                <td style={{ fontSize: 12.5 }}>{row.contact}</td>
                <td style={{ fontSize: 12 }}>{row.category}</td>
                <td className="mono">{row.size}</td>
                <td className="r mono bold">{row.qty}</td>
                <td className="mono">{row.neededBy}</td>
                <td>
                  <span style={{ fontSize: 11.5, color: row.entryOrigin === 'direct' ? 'var(--purple)' : 'var(--t3)', fontWeight: 600 }}>
                    {row.entryOrigin === 'direct' ? 'Direct Inquiry' : 'From Warm Lead'}
                  </span>
                </td>
                <td><Badge status={row.status as BadgeStatus} /></td>
                <td><ChipPIC label={row.pic} /></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(row)}>View</Btn>
                    {['Under Review', 'Quotation Rejected'].includes(row.status) && (
                      <Btn variant="ghost" sm style={{ color: 'var(--purple)' }} onClick={() => setQuotationInquiryId(row.id)}>→ Quote</Btn>
                    )}
                    {row.status === 'Validation Rejected' && row.hasAlternative && (
                      <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => applyAlternative(row.id)}>Use Alternative</Btn>
                    )}
                    {!row.sourceWarmLeadId && !row.backfilledWarmLeadId && (
                      <Btn
                        variant="ghost"
                        sm
                        disabled={addingWarmLeadId === row.id}
                        style={{ color: 'var(--brand)' }}
                        onClick={() => addToWarmLeads(row.id)}
                      >
                        {addingWarmLeadId === row.id ? 'Adding...' : '+ Warm Lead'}
                      </Btn>
                    )}
                    {row.backfilledWarmLeadId && (
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Warm Lead Added</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Inquiry ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.company },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Channel', value: viewRow.channel },
            { label: 'Entry path', value: viewRow.entryOrigin === 'direct' ? 'Direct Inquiry' : 'From Warm Lead' },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Container size', value: viewRow.size },
            { label: 'Condition', value: viewRow.condition },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Needed by', value: viewRow.neededBy },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Received', value: `${viewRow.date} ${viewRow.time}` },
            ...(viewRow.rejectionReason ? [{ label: 'Rejection reason', value: viewRow.rejectionReason }] : []),
            ...(viewRow.altSize ? [{ label: 'Alternative size', value: viewRow.altSize }] : []),
            ...(viewRow.altCondition ? [{ label: 'Alternative condition', value: viewRow.altCondition }] : []),
            ...(viewRow.altQuantity != null ? [{ label: 'Alternative quantity', value: viewRow.altQuantity }] : []),
            ...(viewRow.altAskingPrice != null ? [{ label: 'Alternative asking price', value: `$${viewRow.altAskingPrice.toLocaleString()}` }] : []),
            ...(viewRow.altNotes ? [{ label: 'Alternative offer notes', value: viewRow.altNotes }] : []),
          ]}
        />
      )}
    </div>
  )
}


export default InquiryList
