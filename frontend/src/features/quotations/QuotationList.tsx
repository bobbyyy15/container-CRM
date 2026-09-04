import React, { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import { QuotationDialog, SaleDialog, type InquiryOption, type QuotationOption } from '../pipeline/PipelineDialogs'
import { useQuotations } from '../../hooks/useQuotations'
import { useInquiries } from '../../hooks/useInquiries'

const QuotationList = () => {
  const [revision, setRevision] = useState(0)
  const [showQuotation, setShowQuotation] = useState(false)
  const [saleQuotationId, setSaleQuotationId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [viewRow, setViewRow] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const quotes = useQuotations(revision)
  const inquiries = useInquiries(revision)
  const quotePics = [...new Set(quotes.map(q => q.pic).filter(Boolean))].sort() as string[]
  const filteredQuotes = quotes.filter(q => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [q.co, q.contact, q.ref, q.category].some(value => String(value).toLowerCase().includes(term))
    const statusMatch = !statusFilter || q.status === statusFilter
    const picMatch = !picFilter || q.pic === picFilter
    return searchMatch && statusMatch && picMatch
  })

  const updateQuotationStatus = async (id: string, status: string) => {
    setActionError('')
    try {
      await api.patch(`/deals/quotations/${id}/status`, { status })
      setRevision(value => value + 1)
    } catch (error: any) {
      setActionError(error.response?.data?.error?.message ?? error.message ?? 'Could not update the quotation.')
    }
  }

  const quotationActions: Record<string, string[]> = {
    Draft: ['Sent', 'Accepted', 'Rejected'],
    Sent: ['Viewed', 'Accepted', 'Rejected'],
    Viewed: ['Accepted', 'Rejected'],
    Accepted: ['Rejected'],
  }

  const removeQuotation = async (target: any) => {
    const id = typeof target === 'string' ? target : target.id
    const rowObj = typeof target === 'object' ? target : (quotes as any[]).find(q => q.id === id)
    const companyName = rowObj?.co || ''
    const { confirmed, reason, checked } = await askReason({
      title: 'Remove quotation',
      message: 'Why should this quotation be removed?',
      confirmLabel: 'Remove',
      danger: true,
      checkboxLabel: companyName
        ? `Block entire company (${companyName}) and all associated contacts`
        : 'Block entire company and all associated contacts',
    })
    if (!confirmed || !reason) return
    setActionError('')
    try {
      await api.post(`/leads/quotation/${id}/remove`, { reason, blockCompany: checked ?? false })
      toast(checked ? `Entire company ${companyName ? `"${companyName}" ` : ''}& all contacts removed and blocked` : 'Quotation removed', 'success')
      setRevision(value => value + 1)
    } catch (error: any) {
      setActionError(error.response?.data?.error?.message ?? error.message ?? 'Could not remove the quotation.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showQuotation && (
        <QuotationDialog
          inquiries={inquiries as InquiryOption[]}
          onClose={() => setShowQuotation(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {saleQuotationId && (
        <SaleDialog
          quotations={quotes as QuotationOption[]}
          initialId={saleQuotationId}
          onClose={() => setSaleQuotationId(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '16px 20px', flexShrink: 0, background: 'var(--ws)', borderBottom: '1px solid var(--border-s)' }}>
        {[
          { label: 'Draft', val: quotes.filter(q => q.status === 'Draft').length, icon: I.edit, color: '#6B7280' },
          { label: 'Sent', val: quotes.filter(q => q.status === 'Sent').length, icon: I.mail, color: '#315EF6' },
          { label: 'Viewed', val: quotes.filter(q => q.status === 'Viewed').length, icon: I.search, color: '#7C3AED' },
          { label: 'Accepted', val: quotes.filter(q => q.status === 'Accepted').length, icon: I.check, color: '#059669' },
          { label: 'Rejected', val: quotes.filter(q => q.status === 'Rejected').length, icon: I.x, color: '#DC2626' },
          { label: 'Converted', val: quotes.filter(q => q.status === 'Converted').length, icon: I.sales, color: '#0D9488' },
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
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search quotations…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Viewed">Viewed</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Converted">Converted</option>
        </select>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{quotePics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <div className="toolbar-right">
          <ExportMenu data={filteredQuotes} filename="quotations" />
          <Btn variant="primary" sm onClick={() => setShowQuotation(true)}><Ic n={I.plus} size={13} /> Create Quotation</Btn>
        </div>
      </div>
      {actionError && <div style={{ margin: '0 20px 10px', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Quote #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th className="r">Qty</th><th className="r">Total Sell</th><th className="r">Est. Profit</th>
            <th className="r">Margin</th><th>Status</th><th>Source</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {filteredQuotes.map(q => (
              <tr key={q.ref}>
                <td><span className="ref-id" style={{ color: 'var(--purple)' }}>{q.ref}</span></td>
                <td style={{ fontSize: 12.5 }}>{q.date}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{q.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{q.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{q.category}</td>
                <td className="mono">{q.size}</td>
                <td className="r mono bold">{q.qty}</td>
                <td className="r revenue-cell">${q.sellTotal.toLocaleString()}</td>
                <td className="r profit-cell">${q.profit.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{q.margin.toFixed(1)}%</td>
                <td><Badge status={q.status as BadgeStatus} /></td>
                <td><span className="ref-id" style={{ color: 'var(--orange)', fontSize: 11 }}>{q.source}</span></td>
                <td><ChipPIC label={q.pic} /></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(q)}>View</Btn>
                    {(quotationActions[q.status] || []).length > 0 && (
                      <select className="sel" value="" aria-label={`Update ${q.ref} status`} onChange={e => { if (e.target.value) updateQuotationStatus(q.id, e.target.value) }} style={{ padding: '4px 8px', fontSize: 11, minWidth: 112 }}>
                        <option value="">Change status…</option>
                        {quotationActions[q.status].map(status => <option key={status} value={status}>Mark {status}</option>)}
                      </select>
                    )}
                    {q.status === 'Accepted' && <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => setSaleQuotationId(q.id)}>→ Sale</Btn>}
                    {q.status !== 'Converted' && <Btn variant="ghost" sm style={{ color: 'var(--red)' }} onClick={() => removeQuotation(q)}>Remove</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Quotation ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.co },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Total sell', value: `$${viewRow.sellTotal.toLocaleString()}` },
            { label: 'Est. profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Margin', value: `${viewRow.margin.toFixed(1)}%` },
            { label: 'Source inquiry', value: viewRow.source },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Date', value: viewRow.date },
          ]}
        />
      )}
    </div>
  )
}

// ─── Sales Tracker ────────────────────────────────────────────────────────────

export default QuotationList
