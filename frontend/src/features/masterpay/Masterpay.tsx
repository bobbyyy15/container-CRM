import React, { useState } from 'react'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import EmptyTableState from '../../components/ui/EmptyTableState'
import { TableSkeleton } from '../../components/ui/SkeletonLoader'
import RefreshButton from '../../components/ui/RefreshButton'
import { useMasterpay } from '../../hooks/useMasterpay'
import MasterpayPaymentDialog from './MasterpayPaymentDialog'

const PAYMENT_STYLE: Record<string, { background: string; color: string }> = {
  'Paid': { background: 'var(--green-bg)', color: 'var(--green-text)' },
  'Partially Paid': { background: 'var(--amber-bg)', color: 'var(--amber-text)' },
  'Unpaid': { background: 'var(--s3)', color: 'var(--t3)' },
}

const money = (value: number) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

/**
 * Operations -> Masterpay. One row per sale in the client's Masterpay layout. Everything
 * except the payment fields is read from the sale, its customer account and company, so
 * this sheet cannot drift from Sales Tracker; the payment date entered here is the one
 * Sales Tracker shows.
 */
const Masterpay = ({ role }: { role?: string }) => {
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const rows = useMasterpay(revision)
  const canRecord = role === 'admin' || role === 'operations'

  const pics = [...new Set(rows.map(r => r.pic).filter(Boolean))].sort() as string[]
  const filtered = rows.filter(r => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [r.invoiceNumber, r.releaseNumber, r.customerId, r.companyName, r.contactPerson, r.vendorInvoiceReference]
      .some(value => String(value ?? '').toLowerCase().includes(term))
    return searchMatch && (!paymentFilter || r.paymentStatus === paymentFilter) && (!picFilter || r.pic === picFilter)
  })

  // A cancelled sale stays on the sheet as a record but is not money owed or earned.
  const standing = filtered.filter(r => r.saleStatus !== 'Cancelled')
  const paidCount = standing.filter(r => r.paymentStatus === 'Paid').length
  const partialCount = standing.filter(r => r.paymentStatus === 'Partially Paid').length
  const unpaidCount = standing.filter(r => r.paymentStatus === 'Unpaid').length
  const collected = standing.reduce((sum, r) => sum + Number(r.paymentAmount || 0), 0)
  const totalProfit = standing.reduce((sum, r) => sum + Number(r.totalProfit || 0), 0)

  const exportRows = filtered.map(r => ({
    'Date Purchase': r.datePurchaseLabel,
    'PIC': r.pic,
    'Customer ID': r.customerId,
    'Invoice #': r.invoiceNumber,
    'Vendor Inv. Reference': r.vendorInvoiceReference,
    'Company Name': r.companyName,
    'Contact Person': r.contactPerson,
    'Email Address': r.emailAddress,
    'Contact Number': r.contactNumber,
    'Business Address': r.businessAddress,
    'Unit Location': r.unitLocation,
    'Qty': r.quantity,
    'Size': r.size,
    'Category': r.category,
    'Condition': r.condition,
    'Buying Price': r.buyingPrice,
    'Selling Price': r.sellingPrice,
    'Total (SR)': r.totalSell,
    'Profit': r.profit,
    'Additional Mark-Up': r.additionalMarkup,
    'Credit': r.credit,
    'Total Profit': r.totalProfit,
    'Status': r.paymentStatus,
    'Payment Date': r.paymentDateLabel,
    'Release Ref.': r.releaseNumber,
    'Release Date': r.releaseDateLabel,
    'Remarks': r.remarks,
  }))

  const muted = (text: string) => <span style={{ color: 'var(--t4)' }}>{text}</span>
  const COLUMN_COUNT = canRecord ? 28 : 27

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {editing && (
        <MasterpayPaymentDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Masterpay</div>
          <div className="page-desc">Payment against every sale. The payment date recorded here is the one Sales Tracker shows.</div>
        </div>
      </div>

      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { label: 'Paid', val: paidCount.toString(), color: 'var(--green)' },
          { label: 'Partially Paid', val: partialCount.toString(), color: 'var(--amber)' },
          { label: 'Unpaid', val: unpaidCount.toString(), color: 'var(--t3)' },
          { label: 'Collected', val: money(collected), color: 'var(--brand)' },
          { label: 'Total Profit', val: money(totalProfit), color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} style={{ textAlign: 'center', padding: '8px 0', borderRight: '1px solid var(--border-s)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search invoice, release, Customer ID, company…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} aria-label="Payment status">
          <option value="">All payments</option>
          <option value="Paid">Paid</option>
          <option value="Partially Paid">Partially paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)} aria-label="PIC">
          <option value="">All PICs</option>
          {pics.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="toolbar-right">
          <span className="count-label">{filtered.length} sales</span>
          <RefreshButton cacheKey="deals:masterpay" label="Masterpay" onRefresh={() => setRevision(value => value + 1)} />
          <ExportMenu data={exportRows} filename="masterpay" />
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Date Purchase</th><th>PIC</th><th>Customer ID</th><th>Invoice #</th><th>Vendor Inv. Reference</th>
            <th>Company Name</th><th>Contact Person</th><th>Email Address</th><th>Contact Number</th><th>Business Address</th>
            <th>Unit Location</th><th className="r">Qty</th><th>Size</th><th>Category</th><th>Condition</th>
            <th className="r">Buying Price</th><th className="r">Selling Price</th><th className="r">Total (SR)</th><th className="r">Profit</th>
            <th className="r">Additional Mark-Up</th><th className="r">Credit</th><th className="r">Total Profit</th>
            <th>Status</th><th>Payment Date</th><th>Release Ref.</th><th>Release Date</th><th>Remarks</th>
            {canRecord && <th className="col-actions">Actions</th>}
          </tr></thead>
          {rows.loading && filtered.length === 0 ? (
            <TableSkeleton rows={8} cols={COLUMN_COUNT} asTable={true} />
          ) : (
            <tbody>
              {filtered.length === 0 && (
                <EmptyTableState
                  colSpan={COLUMN_COUNT}
                  icon={I.profit}
                  title="No sales to show"
                  subtitle={search || paymentFilter || picFilter
                    ? 'No sales match your filters. Try clearing the search or filters.'
                    : 'Every sale recorded in Sales Tracker appears here for its payment to be recorded.'}
                />
              )}
              {filtered.map(r => (
                <tr key={r.saleId} style={r.saleStatus === 'Cancelled' ? { opacity: 0.6 } : undefined}>
                  <td style={{ fontSize: 12.5 }}>{r.datePurchaseLabel}</td>
                  <td><ChipPIC label={r.pic || 'Unassigned'} /></td>
                  <td><span className="ref-id">{r.customerId || '—'}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.invoiceNumber || muted('—')}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.vendorInvoiceReference || muted('—')}</td>
                  <td style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{r.companyName}</td>
                  <td style={{ fontSize: 12.5 }}>{r.contactPerson || muted('—')}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.emailAddress || muted('—')}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.contactNumber || muted('—')}</td>
                  <td style={{ fontSize: 12 }}>{r.businessAddress || muted('—')}</td>
                  <td style={{ fontSize: 12 }}>{r.unitLocation || muted('—')}</td>
                  <td className="r mono bold">{r.quantity}</td>
                  <td className="mono">{r.size || muted('—')}</td>
                  <td style={{ fontSize: 12.5 }}>{r.category || muted('—')}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--t3)' }}>{r.condition || muted('—')}</td>
                  <td className="r cost-cell">{money(r.buyingPrice)}</td>
                  <td className="r mono">{money(r.sellingPrice)}</td>
                  <td className="r revenue-cell">{money(r.totalSell)}</td>
                  <td className="r profit-cell">{money(r.profit)}</td>
                  <td className="r mono">{money(r.additionalMarkup)}</td>
                  <td className="r mono">{money(r.credit)}</td>
                  <td className="r profit-cell" style={{ fontWeight: 700 }}>{money(r.totalProfit)}</td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, ...(PAYMENT_STYLE[r.paymentStatus] ?? PAYMENT_STYLE.Unpaid) }}>{r.paymentStatus}</span>
                    {r.saleStatus === 'Cancelled' && <div style={{ fontSize: 10.5, color: 'var(--red)', marginTop: 2 }}>Sale cancelled</div>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.paymentDateLabel || muted('—')}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.releaseNumber || muted('—')}</td>
                  <td style={{ fontSize: 12.5 }}>{r.releaseDateLabel || muted('—')}</td>
                  <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.remarks}>{r.remarks || muted('—')}</td>
                  {canRecord && (
                    <td className="col-actions">
                      <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={() => setEditing(r)}>
                        {r.hasRecord ? 'Edit payment' : 'Record payment'}
                      </Btn>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}

export default Masterpay
