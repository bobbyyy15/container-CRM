import React, { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useCatalogList } from '../../hooks/useCatalogList'
import { invalidateCache } from '../../lib/dataCache'

/**
 * Edits a sale that already exists.
 *
 * Only rates are edited, never totals: revenue, buying cost and profit are recalculated on
 * the server from quantity, buying rate and selling price, so nothing typed here can put a
 * figure into the dashboards that the numbers do not support. The values shown below the
 * form are what will be stored.
 */
const EditSaleDialog = ({ sale, pics, onClose, onSaved }: {
  sale: any
  pics: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')
  const types = useCatalogList('/catalog/categories')

  const [saleNumber, setSaleNumber] = useState(sale.saleNumber || '')
  const [invoiceNumber, setInvoiceNumber] = useState(sale.invoiceNumber || '')
  const [saleDate, setSaleDate] = useState((sale.saleDate || sale.createdAt || '').slice(0, 10))
  const [totalUnits, setTotalUnits] = useState(sale.qty || 1)
  const [buyingRate, setBuyingRate] = useState(sale.buyPU || 0)
  const [sellingPrice, setSellingPrice] = useState(sale.sellPU || 0)
  const [containerSizeId, setContainerSizeId] = useState(sale.containerSizeId || '')
  const [containerConditionId, setContainerConditionId] = useState(sale.containerConditionId || '')
  const [containerCategoryId, setContainerCategoryId] = useState(sale.containerCategoryId || '')
  const [picId, setPicId] = useState(sale.picId || '')
  const [status, setStatus] = useState(sale.status || 'Won')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const units = Number(totalUnits) || 0
  const revenue = (Number(sellingPrice) || 0) * units
  const buyingCost = (Number(buyingRate) || 0) * units
  const grossProfit = revenue - buyingCost

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      await api.patch(`/deals/sales/${sale.id}`, {
        saleNumber: saleNumber.trim().toUpperCase(),
        invoiceNumber: invoiceNumber.trim() || null,
        saleDate: saleDate || null,
        totalUnits: units,
        buyingRate: Number(buyingRate) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        containerSizeId: containerSizeId || null,
        containerConditionId: containerConditionId || null,
        containerCategoryId: containerCategoryId || null,
        picId: picId || null,
        status,
      })
      // The list reads through a 60-second cache, so drop it or the row it just saved
      // keeps showing the old figures.
      invalidateCache('deals:sales')
      onSaved()
      onClose()
    } catch (caught: any) {
      setError(caught?.response?.data?.error?.message ?? caught?.message ?? 'Could not save the sale.')
    } finally {
      setWorking(false)
    }
  }

  const label = (text: string, required = false) => (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>
      {text}{required && <span style={{ color: 'var(--red)' }}> *</span>}
    </div>
  )

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 680 }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit sale {sale.ref}</div>
            <div className="modal-desc">Totals are recalculated from quantity, buying rate and selling price.</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('Sale number', true)}
              <input className="inp" value={saleNumber} onChange={e => setSaleNumber(e.target.value)} placeholder="WAVE-10317" required />
            </div>
            <div>
              {label('Invoice number')}
              <input className="inp" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Typed from the invoice" />
            </div>
            <div>
              {label('Date of sale')}
              <input className="inp" type="date" value={saleDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setSaleDate(e.target.value)} />
            </div>
            <div>
              {label('Status')}
              <select className="inp" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="Won">Won</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              {label('Type')}
              <select className="inp" value={containerCategoryId} onChange={e => setContainerCategoryId(e.target.value)}>
                <option value="">Not specified</option>
                {types.map(type => <option key={type.id} value={type.id}>{(type as any).code ? `${(type as any).code} — ${type.name}` : type.name}</option>)}
              </select>
            </div>
            <div>
              {label('Size')}
              <select className="inp" value={containerSizeId} onChange={e => setContainerSizeId(e.target.value)}>
                <option value="">Not specified</option>
                {sizes.map(size => <option key={size.id} value={size.id}>{size.name}</option>)}
              </select>
            </div>
            <div>
              {label('Condition')}
              <select className="inp" value={containerConditionId} onChange={e => setContainerConditionId(e.target.value)}>
                <option value="">Not specified</option>
                {conditions.map(condition => <option key={condition.id} value={condition.id}>{condition.name}</option>)}
              </select>
            </div>
            <div>
              {label('PIC')}
              <select className="inp" value={picId} onChange={e => setPicId(e.target.value)}>
                <option value="">Unassigned</option>
                {pics.map(pic => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
              </select>
            </div>
            <div>
              {label('Quantity', true)}
              <input className="inp" type="number" min="1" value={totalUnits} onChange={e => setTotalUnits(Number(e.target.value))} required />
            </div>
            <div>
              {label('Buying rate / unit ($)', true)}
              <input className="inp" type="number" min="0" step="0.01" value={buyingRate} onChange={e => setBuyingRate(e.target.value === '' ? 0 : Number(e.target.value))} required />
            </div>
            <div>
              {label('Selling price / unit ($)', true)}
              <input className="inp" type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value === '' ? 0 : Number(e.target.value))} required />
            </div>
            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, background: 'var(--s2)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Total buying cost</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>${buyingCost.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Revenue</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>${revenue.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Gross profit</div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: grossProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>${grossProfit.toLocaleString()}</div>
              </div>
            </div>
            {status === 'Cancelled' && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--t3)' }}>
                A cancelled sale stays in Sales Tracker as a record, and is left out of revenue, profit, units and client totals.
              </div>
            )}
            {error && (
              <div style={{ gridColumn: '1 / -1', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{error}</div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={working}>{working ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditSaleDialog
