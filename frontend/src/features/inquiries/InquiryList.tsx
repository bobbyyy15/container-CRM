import React, { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import EmptyTableState from '../../components/ui/EmptyTableState'
import RefreshButton from '../../components/ui/RefreshButton'
import { confirmDelete, confirmBulkDelete } from '../../lib/deleteRecord'
import BulkBar from '../../components/ui/BulkBar'
import { useRowSelection } from '../../hooks/useRowSelection'
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
  // History has to include the ones that closed -- converted to a sale, or lost -- since
  // those are exactly what a repeat offer is based on. The working list holds only open
  // inquiries, so read the full set separately for it.
  const ALL_INQUIRIES = useInquiries(revision, 'all')
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
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const handleDelete = (row: any) => confirmDelete({
    what: 'Inquiry',
    name: row.ref,
    endpoint: `/leads/inquiries/${row.id}`,
    cacheKey: 'leads:inquiries',
    onDeleted: () => setRevision(v => v + 1),
  })

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
  }).sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())

  /**
   * What this customer asked for before, newest first.
   *
   * Quoting a repeat customer means knowing what they took last time and at what size and
   * condition, so the detail view lists their earlier inquiries rather than making someone
   * search the list for the company by hand. Matched on the company, falling back to the
   * contact for a customer recorded without one.
   */
  const historyFor = (row: any) => ALL_INQUIRIES
    .filter(r => r.id !== row.id && (
      (row.companyId && r.companyId === row.companyId) || (row.contactId && r.contactId === row.contactId)
    ))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())

  const selection = useRowSelection(filtered.map(r => r.id))

  const handleBulkDelete = async () => {
    if (bulkDeleting) return
    setBulkDeleting(true)
    try {
      await confirmBulkDelete({
        what: 'inquiry',
        ids: selection.selected,
        bulkEndpoint: '/leads/inquiries/bulk-delete',
        cacheKey: 'leads:inquiries',
        onDeleted: deletedIds => {
          selection.remove(deletedIds)
          if (deletedIds.length) setRevision(value => value + 1)
        },
      })
    } finally {
      setBulkDeleting(false)
    }
  }

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
        <BulkBar count={selection.selected.length} busy={bulkDeleting} onDelete={handleBulkDelete} />
        <div className="toolbar-right">
          <RefreshButton cacheKey="leads:inquiries" label="Inquiries" onRefresh={() => setRevision(v => v + 1)} />
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
              <th className="col-check">
                <input
                  ref={selection.selectAllRef}
                  type="checkbox"
                  className="cb"
                  checked={selection.allSelected}
                  disabled={bulkDeleting || filtered.length === 0}
                  aria-label="Select all visible inquiries"
                  onChange={e => selection.toggleAll(e.target.checked)}
                />
              </th>
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
            {filtered.length === 0 && (
              <EmptyTableState
                colSpan={14}
                icon={I.inquiry}
                title="No inquiries found"
                subtitle={lookup || channel || picFilter || tab !== 'All'
                  ? 'No inquiries match your filters. Try clearing the search or filter tab.'
                  : 'No inquiries have been raised yet.'}
                actionLabel="New Inquiry"
                onAction={() => setShowNewInquiry(true)}
              />
            )}
            {filtered.map(row => (
              <tr key={row.ref} style={selection.isSelected(row.id) ? { background: 'var(--brand-50)' } : undefined}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    className="cb"
                    checked={selection.isSelected(row.id)}
                    disabled={bulkDeleting}
                    aria-label={`Select inquiry ${row.ref}`}
                    onChange={() => selection.toggle(row.id)}
                  />
                </td>
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
                    <Btn variant="danger" sm onClick={() => handleDelete(row)} title="Permanently delete this inquiry">
                      <Ic n={I.removed} size={12} /> Delete
                    </Btn>
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
            { label: 'City', value: viewRow.city },
            { label: 'State / Province', value: viewRow.state },
            { label: 'Country', value: viewRow.country },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Received', value: `${viewRow.date} ${viewRow.time}` },
            ...(viewRow.rejectionReason ? [{ label: 'Rejection reason', value: viewRow.rejectionReason }] : []),
            ...(viewRow.altSize ? [{ label: 'Alternative size', value: viewRow.altSize }] : []),
            ...(viewRow.altCondition ? [{ label: 'Alternative condition', value: viewRow.altCondition }] : []),
            ...(viewRow.altQuantity != null ? [{ label: 'Alternative quantity', value: viewRow.altQuantity }] : []),
            ...(viewRow.altAskingPrice != null ? [{ label: 'Alternative asking price', value: `$${viewRow.altAskingPrice.toLocaleString()}` }] : []),
            ...(viewRow.altNotes ? [{ label: 'Alternative offer notes', value: viewRow.altNotes }] : []),
          ]}
          width={620}
          extra={(() => {
            const history = historyFor(viewRow)
            return (
              <div style={{ borderTop: '1px solid var(--border-s)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                  Earlier inquiries from this customer
                </div>
                {history.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--t4)' }}>None — this is their first inquiry on record.</div>
                ) : (
                  <div style={{ maxHeight: 210, overflow: 'auto', border: '1px solid var(--border-s)', borderRadius: 8 }}>
                    <table className="crm" style={{ width: '100%' }}>
                      <thead><tr>
                        <th>Date</th><th>Size</th><th>Condition</th><th className="r">Qty</th><th>Status</th>
                      </tr></thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id}>
                            <td className="mono" style={{ fontSize: 11.5 }}>{h.date}</td>
                            <td style={{ fontSize: 12 }}>{h.size}</td>
                            <td style={{ fontSize: 12 }}>{h.condition}</td>
                            <td className="r mono" style={{ fontSize: 12 }}>{h.qty}</td>
                            <td><Badge status={h.status as BadgeStatus} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        />
      )}
    </div>
  )
}


export default InquiryList
