import React, { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC, StatusSmartChip } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import { NewManualSaleDialog, SaleDialog, type QuotationOption } from '../pipeline/PipelineDialogs'
import { useSales } from '../../hooks/useSales'
import { useQuotations } from '../../hooks/useQuotations'

const SalesTracker = () => {
  const [revision, setRevision] = useState(0)
  const [showSale, setShowSale] = useState(false)
  const [showManualSale, setShowManualSale] = useState(false)
  const [viewRow, setViewRow] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateRange, setDateRange] = useState('All Time')
  const SALES = useSales(revision)
  const quotations = useQuotations(revision)
  const salesPics = [...new Set(SALES.map(s => s.pic).filter(Boolean))].sort() as string[]
  const salesCategories = [...new Set(SALES.map(s => s.category).filter(Boolean))].sort() as string[]

  const filteredSales = SALES.filter(s => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [s.company, s.contact, s.ref, s.category].some(value => String(value).toLowerCase().includes(term))
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
    return searchMatch && picMatch && categoryMatch && dateMatch
  })

  const totalBuy = filteredSales.reduce((s, r) => s + r.totalBuy, 0)
  const totalSell = filteredSales.reduce((s, r) => s + r.totalSell, 0)
  const totalProfit = filteredSales.reduce((s, r) => s + r.profit, 0)
  const totalUnits = filteredSales.reduce((s, r) => s + r.qty, 0)

  const handleUpdateSaleStatus = async (id: string, ref: string, newStatus: string) => {
    try {
      await api.patch(`/deals/sales/${id}/status`, { status: newStatus })
      toast(`Sale ${ref} status updated to ${newStatus}.`, 'success')
      setRevision(value => value + 1)
    } catch (error: any) {
      toast(error.response?.data?.error?.message || 'Failed to update status.', 'error')
    }
  }

  const handleDeleteSale = async (id: string, ref: string) => {
    const confirmed = await askConfirm({
      title: `Delete Sale ${ref}`,
      message: 'Are you sure you want to delete this sale record? This action cannot be undone.',
      confirmLabel: 'Delete Sale',
      danger: true,
    })
    if (!confirmed) return
    try {
      await api.delete(`/deals/sales/${id}`)
      toast(`Sale ${ref} deleted successfully.`, 'success')
      setRevision(value => value + 1)
    } catch (error: any) {
      toast(error.response?.data?.error?.message || 'Failed to delete sale.', 'error')
    }
  }

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
      {/* Financial KPI strip */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { label: 'Units Sold', val: totalUnits.toString(), color: '#7C3AED', fmt: false },
          { label: 'Buying Cost', val: `$${totalBuy.toLocaleString()}`, color: 'var(--t3)', fmt: false },
          { label: 'Total Revenue', val: `$${totalSell.toLocaleString()}`, color: 'var(--brand)', fmt: false },
          { label: 'Gross Profit', val: `$${totalProfit.toLocaleString()}`, color: 'var(--green)', fmt: false },
          { label: 'Avg Margin', val: `${(totalSell ? totalProfit / totalSell * 100 : 0).toFixed(1)}%`, color: '#0D9488', fmt: false },
        ].map(k => (
          <div key={k.label} style={{ textAlign: 'center', padding: '8px 0', borderRight: '1px solid var(--border-s)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search sales…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{salesPics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <select className="sel" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All Categories</option>{salesCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select className="sel" value={dateRange} onChange={e => setDateRange(e.target.value)}><option>This Month</option><option>Last Month</option><option>All Time</option></select>
        <div className="toolbar-right">
          <ExportMenu data={filteredSales} filename="sales" />
          <Btn variant="secondary" sm onClick={() => setShowManualSale(true)}><Ic n={I.plus} size={13} /> Record Sale Manually</Btn>
          <Btn variant="primary" sm onClick={() => setShowSale(true)}><Ic n={I.plus} size={13} /> From Quotation</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Sale #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th>Condition</th><th className="r">Qty</th><th className="r">Buy/Unit</th>
            <th className="r">Sell/Unit</th><th className="r">Total Buy</th><th className="r">Total Sell</th>
            <th className="r">Profit</th><th className="r">Margin</th><th>PIC</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {filteredSales.map(s => (
              <tr key={s.ref}>
                <td><span className="ref-id">{s.ref}</span></td>
                <td style={{ fontSize: 12.5 }}>{s.date}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{s.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{s.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{s.category}</td>
                <td className="mono">{s.size}</td>
                <td style={{ fontSize: 11.5, color: 'var(--t3)' }}>{s.condition}</td>
                <td className="r mono bold">{s.qty}</td>
                <td className="r cost-cell">${s.buyPU.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 600 }}>${s.sellPU.toLocaleString()}</td>
                <td className="r cost-cell">${s.totalBuy.toLocaleString()}</td>
                <td className="r revenue-cell">${s.totalSell.toLocaleString()}</td>
                <td className="r profit-cell">${s.profit.toLocaleString()}</td>
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
          <tfoot>
            <tr style={{ background: 'var(--s2)' }}>
              <td colSpan={6} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>Totals ({filteredSales.length} sales)</td>
              <td className="r mono bold" style={{ color: 'var(--t1)' }}>{totalUnits}</td>
              <td colSpan={2} />
              <td className="r cost-cell" style={{ fontWeight: 700 }}>${totalBuy.toLocaleString()}</td>
              <td className="r revenue-cell" style={{ fontWeight: 700 }}>${totalSell.toLocaleString()}</td>
              <td className="r profit-cell" style={{ fontWeight: 800, fontSize: 14 }}>${totalProfit.toLocaleString()}</td>
              <td className="r mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{(totalSell ? totalProfit / totalSell * 100 : 0).toFixed(1)}%</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Sale ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.company },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Condition', value: viewRow.condition },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Total buy', value: `$${viewRow.totalBuy.toLocaleString()}` },
            { label: 'Total sell', value: `$${viewRow.totalSell.toLocaleString()}` },
            { label: 'Profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Margin', value: `${viewRow.margin.toFixed(1)}%` },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Date', value: viewRow.date },
          ]}
        />
      )}
    </div>
  )
}


export default SalesTracker
