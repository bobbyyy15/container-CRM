import React, { useState } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC, StatusSmartChip } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import EmptyTableState from '../../components/ui/EmptyTableState'
import { TableSkeleton } from '../../components/ui/SkeletonLoader'
import RefreshButton from '../../components/ui/RefreshButton'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import BulkBar from '../../components/ui/BulkBar'
import { useRowSelection } from '../../hooks/useRowSelection'
import { confirmBulkDelete } from '../../lib/deleteRecord'
import { invalidateCache } from '../../lib/dataCache'
import type { BadgeStatus } from '../../app/types'
import { NewManualSaleDialog, SaleDialog, type QuotationOption } from '../pipeline/PipelineDialogs'
import { useSales } from '../../hooks/useSales'
import EditSaleDialog from './EditSaleDialog'
import SalesImportDialog from './SalesImportDialog'
import { usePics } from '../pipeline/PipelineDialogs'
import { useQuotations } from '../../hooks/useQuotations'
import { formatDateOnly } from '../../hooks/mappers'

const COLUMN_COUNT = 19

const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const SalesTracker = () => {
  const [revision, setRevision] = useState(0)
  const [showSale, setShowSale] = useState(false)
  const [showManualSale, setShowManualSale] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingSale, setEditingSale] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const pics = usePics()
  const [viewRow, setViewRow] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateRange, setDateRange] = useState('All Time')
  const SALES = useSales(revision)
  const quotations = useQuotations(revision)
  const salesPics = [...new Set(SALES.map(s => s.pic).filter(Boolean))].sort() as string[]
  const salesCategories = [...new Set(SALES.map(s => s.category).filter(Boolean))].sort() as string[]
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const filteredSales = SALES.filter(s => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [s.invoiceNumber, s.releaseNumber, s.clientCode, s.company, s.contact, s.category]
      .some(value => String(value ?? '').toLowerCase().includes(term))
    const picMatch = !picFilter || s.pic === picFilter
    const categoryMatch = !categoryFilter || s.category === categoryFilter
    let dateMatch = true
    if (dateRange !== 'All Time' && s.createdAt) {
      const saleDate = new Date(s.createdAt)
      const now = new Date()
      if (dateRange === 'This Month') {
        dateMatch = saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth()
      } else if (dateRange === 'Last Month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        dateMatch = saleDate.getFullYear() === lastMonth.getFullYear() && saleDate.getMonth() === lastMonth.getMonth()
      }
    }
    const statusMatch = !statusFilter || s.status === statusFilter
    const paymentMatch = !paymentFilter || s.paymentStatus === paymentFilter
    return searchMatch && picMatch && categoryMatch && dateMatch && statusMatch && paymentMatch
  })

  // Cancelled sales stay on the list -- they are history -- but they are not money. The
  // totals above the table count only the sales that actually stand, the same rule the
  // dashboards apply by filtering on status = 'Won'.
  const countedSales = filteredSales.filter(s => s.status !== 'Cancelled')
  const cancelledCount = filteredSales.length - countedSales.length

  const totalBuy = countedSales.reduce((s, r) => s + r.totalBuy, 0)
  const totalSell = countedSales.reduce((s, r) => s + r.totalSell, 0)
  const totalProfit = countedSales.reduce((s, r) => s + r.profit, 0)
  const totalUnits = countedSales.reduce((s, r) => s + r.qty, 0)
  const totalMargin = totalSell > 0 ? totalProfit / totalSell * 100 : 0

  // Exported with the labels a person reads on screen, not the internal field names.
  const exportRows = filteredSales.map(s => ({
    'Invoice Number': s.invoiceNumber,
    'Release Number': s.releaseNumber,
    'Date': s.date,
    'Payment Date': s.paymentDateLabel,
    'Payment Status': s.paymentStatus,
    'Client ID': s.clientCode,
    'Company': s.company,
    'Contact': s.contact,
    'Type': s.type,
    'Size': s.size,
    'Condition': s.condition,
    'Quantity': s.qty,
    'Buy / Unit': s.buyPU,
    'Sell / Unit': s.sellPU,
    'Total Buy': s.totalBuy,
    'Total Sell': s.totalSell,
    'Profit': s.profit,
    'Margin %': Number(s.margin.toFixed(1)),
    'PIC': s.pic,
    'Status': s.status,
  }))

  const handleUpdateSaleStatus = async (id: string, ref: string, newStatus: string) => {
    try {
      await api.patch(`/deals/sales/${id}/status`, { status: newStatus })
      toast(`Sale ${ref} status updated to ${newStatus}.`, 'success')
      setRevision(value => value + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message || 'Failed to update status.', 'error')
    }
  }

  const handleDeleteSale = async (id: string, ref: string) => {
    // askConfirm resolves to an object, so this must read .confirmed: testing the
    // object itself is always truthy and deleted the sale even when the user cancelled.
    const { confirmed } = await askConfirm({
      title: `Delete Sale ${ref}`,
      message: `Are you sure you want to delete this sale record? This action cannot be undone.`,
      confirmLabel: 'Delete Sale',
      danger: true,
    })
    if (!confirmed) return
    try {
      await api.delete(`/deals/sales/${id}`)
      invalidateCache('deals:sales')
      toast(`Sale ${ref} deleted successfully.`, 'success')
      setRevision(value => value + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message || 'Failed to delete sale.', 'error')
    }
  }

  const selection = useRowSelection(filteredSales.map(s => s.id))

  const handleBulkDelete = async () => {
    if (bulkDeleting) return
    setBulkDeleting(true)
    try {
      await confirmBulkDelete({
        what: 'sale',
        ids: selection.selected,
        endpoint: id => `/deals/sales/${id}`,
        cacheKey: 'deals:sales',
        detail: 'A sale with a contract, delivery or Masterpay payment against it is protected.',
        onDeleted: deletedIds => {
          selection.remove(deletedIds)
          if (deletedIds.length) setRevision(value => value + 1)
        },
      })
    } finally {
      setBulkDeleting(false)
    }
  }

  const muted = (text: string) => <span style={{ color: 'var(--t4)' }}>{text}</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showSale && (
        <SaleDialog
          quotations={quotations as QuotationOption[]}
          onClose={() => setShowSale(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {showManualSale && (
        <NewManualSaleDialog
          onClose={() => setShowManualSale(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {showImport && (
        <SalesImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => setRevision(value => value + 1)}
        />
      )}
      {editingSale && (
        <EditSaleDialog
          sale={editingSale}
          pics={pics}
          onClose={() => setEditingSale(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {/* Financial KPI strip */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { label: 'Units Sold', val: totalUnits.toString(), color: '#7C3AED' },
          { label: 'Total Buy', val: money(totalBuy), color: 'var(--t3)' },
          { label: 'Total Sell', val: money(totalSell), color: 'var(--brand)' },
          { label: 'Profit', val: money(totalProfit), color: 'var(--green)' },
          { label: 'Profit Margin', val: `${totalMargin.toFixed(1)}%`, color: '#0D9488' },
        ].map(k => (
          <div key={k.label} style={{ textAlign: 'center', padding: '8px 0', borderRight: '1px solid var(--border-s)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search invoice, release, Client ID, company…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{salesPics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <select className="sel" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All Categories</option>{salesCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Sale status">
          <option value="">All statuses</option>
          <option value="Won">Won</option>
          <option value="Pending">Pending</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select className="sel" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} aria-label="Payment">
          <option value="">All payments</option>
          <option value="Paid">Paid</option>
          <option value="Partially Paid">Partially paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <select className="sel" value={dateRange} onChange={e => setDateRange(e.target.value)}><option>This Month</option><option>Last Month</option><option>All Time</option></select>
        <BulkBar count={selection.selected.length} busy={bulkDeleting} onDelete={handleBulkDelete} />
        <div className="toolbar-right">
          <RefreshButton cacheKey="deals:sales" label="Sales" onRefresh={() => setRevision(value => value + 1)} />
          <ExportMenu data={exportRows} filename="sales" />
          <Btn variant="secondary" sm onClick={() => setShowImport(true)}><Ic n={I.export} size={13} /> Import Sales</Btn>
          <Btn variant="secondary" sm onClick={() => setShowManualSale(true)}><Ic n={I.plus} size={13} /> Record Sale Manually</Btn>
          <Btn variant="primary" sm onClick={() => setShowSale(true)}><Ic n={I.plus} size={13} /> From Quotation</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check">
              <input
                ref={selection.selectAllRef}
                type="checkbox"
                className="cb"
                checked={selection.allSelected}
                disabled={bulkDeleting || filteredSales.length === 0}
                aria-label="Select all visible sales"
                onChange={e => selection.toggleAll(e.target.checked)}
              />
            </th>
            <th>Invoice #</th><th>Release #</th><th>Date</th><th>Payment Date</th><th>Company / Account</th>
            <th>Type</th><th>Size</th><th>Condition</th><th className="r">Qty</th><th className="r">Buy/Unit</th>
            <th className="r">Sell/Unit</th><th className="r">Total Buy</th><th className="r">Total Sell</th>
            <th className="r">Profit</th><th className="r">Margin</th><th>PIC</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          {SALES.loading && filteredSales.length === 0 ? (
            <TableSkeleton rows={8} cols={COLUMN_COUNT} asTable={true} />
          ) : (
            <tbody>
              {filteredSales.length === 0 && (
                <EmptyTableState
                  colSpan={COLUMN_COUNT}
                  icon={I.sales}
                  title="No sales records found"
                  subtitle={search || picFilter || categoryFilter || paymentFilter || dateRange !== 'This Month'
                    ? 'No sales match your filters. Try widening the date range or clearing the search.'
                    : 'No sales recorded yet. Convert an accepted quotation, or record one manually.'}
                  actionLabel="Record Sale Manually"
                  onAction={() => setShowManualSale(true)}
                />
              )}
            {filteredSales.map(s => (
              <tr key={s.id} style={selection.isSelected(s.id) ? { background: 'var(--brand-50)' } : undefined}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    className="cb"
                    checked={selection.isSelected(s.id)}
                    disabled={bulkDeleting}
                    aria-label={`Select sale ${s.ref}`}
                    onChange={() => selection.toggle(s.id)}
                  />
                </td>
                <td>{s.invoiceNumber ? <span className="ref-id">{s.invoiceNumber}</span> : muted('—')}</td>
                <td className="mono" style={{ fontSize: 12 }}>{s.releaseNumber || muted('—')}</td>
                <td style={{ fontSize: 12.5 }}>{s.date}</td>
                <td style={{ fontSize: 12.5 }} title="From Masterpay">
                  {s.paymentDate ? (
                    <>
                      {s.paymentDateLabel}
                      {s.paymentStatus === 'Partially Paid' && <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>Partial</div>}
                    </>
                  ) : muted('Unpaid')}
                </td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{s.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                    {[s.clientCode, s.contact].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td style={{ fontSize: 12.5 }}>{s.type}</td>
                <td className="mono">{s.size}</td>
                <td style={{ fontSize: 11.5, color: 'var(--t3)' }}>{s.condition}</td>
                <td className="r mono bold">{s.qty}</td>
                <td className="r cost-cell">{money(s.buyPU)}</td>
                <td className="r mono" style={{ fontWeight: 600 }}>{money(s.sellPU)}</td>
                <td className="r cost-cell">{money(s.totalBuy)}</td>
                <td className="r revenue-cell">{money(s.totalSell)}</td>
                <td className="r profit-cell">{money(s.profit)}</td>
                <td className="r mono" style={{ fontWeight: 700, color: s.margin >= 30 ? 'var(--green)' : 'var(--amber)' }}>{s.margin.toFixed(1)}%</td>
                <td><ChipPIC label={s.pic} /></td>
                <td>
                  <StatusSmartChip
                    status={s.status}
                    onStatusChange={newStatus => handleUpdateSaleStatus(s.id, s.ref, newStatus)}
                  />
                </td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(s)}>View</Btn>
                    <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={() => setEditingSale(s)}>Edit</Btn>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)', padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      title={`Delete ${s.ref}`}
                      onClick={() => handleDeleteSale(s.id, s.ref)}
                    >
                      <Ic n={I.removed} size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          )}
          <tfoot>
            <tr style={{ background: 'var(--s2)' }}>
              <td colSpan={9} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>
                Totals ({countedSales.length} sales{cancelledCount ? `, ${cancelledCount} cancelled not counted` : ''})
              </td>
              <td className="r mono bold" style={{ color: 'var(--t1)' }}>{totalUnits}</td>
              <td colSpan={2} />
              <td className="r cost-cell" style={{ fontWeight: 700 }}>{money(totalBuy)}</td>
              <td className="r revenue-cell" style={{ fontWeight: 700 }}>{money(totalSell)}</td>
              <td className="r profit-cell" style={{ fontWeight: 800, fontSize: 14 }}>{money(totalProfit)}</td>
              <td className="r mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{totalMargin.toFixed(1)}%</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Sale ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          width={560}
          fields={[
            { label: 'Invoice number', value: viewRow.invoiceNumber || undefined },
            { label: 'Release number', value: viewRow.releaseNumber || undefined },
            { label: 'Client ID', value: viewRow.clientCode || undefined },
            { label: 'First transaction', value: formatDateOnly(viewRow.firstTransactionDate) || undefined },
            { label: 'Company', value: viewRow.company },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Date', value: viewRow.date },
            { label: 'Payment status', value: viewRow.paymentStatus },
            { label: 'Payment date', value: viewRow.paymentDateLabel || 'Unpaid' },
            { label: 'Type', value: viewRow.type },
            { label: 'Size', value: viewRow.size },
            { label: 'Condition', value: viewRow.condition },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Buying rate / unit', value: money(viewRow.buyPU) },
            { label: 'Selling price / unit', value: money(viewRow.sellPU) },
            { label: 'Total buy', value: money(viewRow.totalBuy) },
            { label: 'Total sell', value: money(viewRow.totalSell) },
            { label: 'Profit', value: money(viewRow.profit) },
            { label: 'Profit margin', value: `${viewRow.margin.toFixed(1)}%` },
            { label: 'PIC', value: viewRow.pic },
          ]}
        />
      )}
    </div>
  )
}

export default SalesTracker
