import React, { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { invalidateCache } from '../../lib/dataCache'

const PAYMENT_STATUSES = ['Unpaid', 'Partially Paid', 'Paid']

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))

/**
 * Records the payment against one sale. This is the only place a payment date is entered;
 * Sales Tracker shows what is saved here. Invoice and release numbers belong to the sale
 * and are edited in Sales Tracker, so they are shown here but not changed.
 */
const MasterpayPaymentDialog = ({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) => {
  const [paymentStatus, setPaymentStatus] = useState<string>(row.paymentStatus || 'Unpaid')
  const [paymentDate, setPaymentDate] = useState<string>(row.paymentDate || '')
  const [paymentAmount, setPaymentAmount] = useState<string>(row.paymentAmount != null ? String(row.paymentAmount) : '')
  const [vendorInvoiceReference, setVendorInvoiceReference] = useState<string>(row.vendorInvoiceReference || '')
  const [unitLocation, setUnitLocation] = useState<string>(row.unitLocation || '')
  const [additionalMarkup, setAdditionalMarkup] = useState<string>(row.additionalMarkup ? String(row.additionalMarkup) : '')
  const [credit, setCredit] = useState<string>(row.credit ? String(row.credit) : '')
  const [releaseDate, setReleaseDate] = useState<string>(row.releaseDate || '')
  const [remarks, setRemarks] = useState<string>(row.remarks || '')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const unpaid = paymentStatus === 'Unpaid'
  const totalProfit = Number(row.profit || 0) + (Number(additionalMarkup) || 0) - (Number(credit) || 0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!unpaid && !paymentDate) {
      setError('A payment date is required once a payment is recorded.')
      return
    }
    setWorking(true)
    setError('')
    try {
      await api.put(`/masterpay/${row.saleId}`, {
        paymentStatus,
        paymentDate: unpaid ? null : paymentDate,
        paymentAmount: numberOrNull(paymentAmount),
        vendorInvoiceReference: vendorInvoiceReference.trim() || null,
        unitLocation: unitLocation.trim() || null,
        additionalMarkup: Number(additionalMarkup) || 0,
        credit: Number(credit) || 0,
        releaseDate: releaseDate || null,
        remarks: remarks.trim() || null,
      })
      // Sales Tracker shows the payment date too, so both lists are refreshed.
      invalidateCache('deals:masterpay')
      invalidateCache('deals:sales')
      onSaved()
      onClose()
    } catch (caught: any) {
      setError(caught?.response?.data?.error?.message ?? caught?.message ?? 'Could not save the payment.')
    } finally {
      setWorking(false)
    }
  }

  const label = (text: string, required = false) => (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>
      {text}{required && <span style={{ color: 'var(--red)' }}> *</span>}
    </div>
  )
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 640 }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Record payment · {row.invoiceNumber || row.releaseNumber || 'Sale'}</div>
            <div className="modal-desc">
              {row.companyName}{row.customerId ? ` · ${row.customerId}` : ''} · Release {row.releaseNumber || '—'} · Total ${Number(row.totalSell || 0).toLocaleString()}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('Payment status', true)}
              <select className="inp" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                {PAYMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div>
              {label('Payment date', !unpaid)}
              <input className="inp" type="date" value={unpaid ? '' : paymentDate} max={today} disabled={unpaid} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div>
              {label('Payment amount ($)')}
              <input className="inp" type="number" min="0" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder={String(row.totalSell ?? '')} />
            </div>
            <div>
              {label('Vendor invoice reference')}
              <input className="inp" value={vendorInvoiceReference} onChange={e => setVendorInvoiceReference(e.target.value)} />
            </div>
            <div>
              {label('Unit location')}
              <input className="inp" value={unitLocation} onChange={e => setUnitLocation(e.target.value)} placeholder="Depot or yard" />
            </div>
            <div>
              {label('Release date')}
              <input className="inp" type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
            </div>
            <div>
              {label('Additional mark-up ($)')}
              <input className="inp" type="number" min="0" step="0.01" value={additionalMarkup} onChange={e => setAdditionalMarkup(e.target.value)} placeholder="0" />
            </div>
            <div>
              {label('Credit ($)')}
              <input className="inp" type="number" min="0" step="0.01" value={credit} onChange={e => setCredit(e.target.value)} placeholder="0" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              {label('Remarks')}
              <textarea className="inp" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, background: 'var(--s2)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Profit on the sale</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>${Number(row.profit || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>+ Mark-up − Credit</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>${((Number(additionalMarkup) || 0) - (Number(credit) || 0)).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Total profit</div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: totalProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>${totalProfit.toLocaleString()}</div>
              </div>
            </div>
            {error && (
              <div style={{ gridColumn: '1 / -1', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{error}</div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={working}>{working ? 'Saving…' : 'Save payment'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MasterpayPaymentDialog
