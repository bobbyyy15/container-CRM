import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../../lib/api'

export type WarmLeadOption = { id: string; company: string; contact: string }
export type InquiryOption = { id: string; ref: string; company: string; contact: string }
export type QuotationOption = { id: string; ref: string; co: string; status: string; qty: number; sellTotal: number }

const Modal = ({ title, description, onClose, children }: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) => (
  <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="modal" style={{ width: 520 }} onClick={event => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <div className="modal-title">{title}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{description}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      {children}
    </div>
  </div>
)

const ErrorMessage = ({ message }: { message: string }) => message
  ? <div style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{message}</div>
  : null

const apiError = (error: any) => error.response?.data?.error?.message ?? error.message ?? 'The operation failed.'

export const NewInquiryDialog = ({ warmLeads, initialId, onClose, onSaved }: {
  warmLeads: WarmLeadOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const [warmLeadId, setWarmLeadId] = useState(initialId ?? warmLeads[0]?.id ?? '')
  const [requirements, setRequirements] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!warmLeadId) return
    setWorking(true)
    setError('')
    try {
      await api.post(`/leads/warm-leads/${warmLeadId}/create-inquiry`, { requirements: requirements.trim() || undefined })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Create inquiry" description="An inquiry must come from an active warm lead." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {warmLeads.length ? <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Warm lead</label>
            <select className="inp" value={warmLeadId} onChange={event => setWarmLeadId(event.target.value)} required>
              {warmLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.company} — {lead.contact}</option>)}
            </select>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Requirements</label>
            <textarea className="inp" rows={4} value={requirements} onChange={event => setRequirements(event.target.value)} placeholder="Container type, size, quantity, location, timing…" />
          </> : (
            <div style={{ padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>
              There are no active warm leads. Convert a Prospect to Warm Lead first.
            </div>
          )}
          <ErrorMessage message={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !warmLeadId}>{working ? 'Creating…' : 'Create Inquiry'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const QuotationDialog = ({ inquiries, initialId, onClose, onSaved }: {
  inquiries: InquiryOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const [inquiryId, setInquiryId] = useState(initialId ?? inquiries[0]?.id ?? '')
  const [description, setDescription] = useState('Shipping container')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [validUntil, setValidUntil] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!inquiryId) return
    setWorking(true)
    setError('')
    try {
      await api.post('/deals/quotations', {
        inquiry_id: inquiryId,
        valid_until: validUntil || undefined,
        items: [{ description: description.trim(), quantity, unit_price: unitPrice }],
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Create quotation" description="The company and contact are taken from the selected inquiry." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inquiries.length ? <>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Inquiry</label>
            <select className="inp" style={{ gridColumn: '1 / -1' }} value={inquiryId} onChange={event => setInquiryId(event.target.value)} required>
              {inquiries.map(inquiry => <option key={inquiry.id} value={inquiry.id}>{inquiry.ref} — {inquiry.company} — {inquiry.contact}</option>)}
            </select>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Item description</label>
            <input className="inp" style={{ gridColumn: '1 / -1' }} value={description} onChange={event => setDescription(event.target.value)} required />
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Quantity</label><input className="inp" type="number" min="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Unit price</label><input className="inp" type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Valid until</label><input className="inp" type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: 'var(--s2)', fontWeight: 700 }}>Quotation total: ${(quantity * unitPrice).toLocaleString()}</div>
          </> : <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>There are no active inquiries available for quotation.</div>}
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !inquiryId || !description.trim()}>{working ? 'Creating…' : 'Create Quotation'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const SaleDialog = ({ quotations, initialId, onClose, onSaved }: {
  quotations: QuotationOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const accepted = quotations.filter(quote => quote.status === 'Accepted')
  const initial = accepted.find(quote => quote.id === initialId) ?? accepted[0]
  const [quotationId, setQuotationId] = useState(initial?.id ?? '')
  const [units, setUnits] = useState(initial?.qty || 1)
  const [buyingCost, setBuyingCost] = useState(0)
  const [revenue, setRevenue] = useState(initial?.sellTotal || 0)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const selectQuote = (id: string) => {
    setQuotationId(id)
    const quote = accepted.find(item => item.id === id)
    if (quote) {
      setUnits(quote.qty || 1)
      setRevenue(quote.sellTotal)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!quotationId) return
    setWorking(true)
    setError('')
    try {
      await api.post(`/deals/quotations/${quotationId}/convert-to-sale`, {
        total_units: units,
        buying_cost: buyingCost,
        revenue,
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Record sale" description="Only accepted quotations can become sales." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {accepted.length ? <>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Accepted quotation</label>
            <select className="inp" style={{ gridColumn: '1 / -1' }} value={quotationId} onChange={event => selectQuote(event.target.value)} required>
              {accepted.map(quote => <option key={quote.id} value={quote.id}>{quote.ref} — {quote.co}</option>)}
            </select>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Units</label><input className="inp" type="number" min="1" value={units} onChange={event => setUnits(Number(event.target.value))} required /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Buying cost total</label><input className="inp" type="number" min="0" step="0.01" value={buyingCost} onChange={event => setBuyingCost(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Revenue total</label><input className="inp" type="number" min="0" step="0.01" value={revenue} onChange={event => setRevenue(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: 'var(--s2)', color: revenue - buyingCost >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>Gross profit: ${(revenue - buyingCost).toLocaleString()}</div>
          </> : <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>No accepted quotations are available. Open Quotations and accept one first.</div>}
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !quotationId}>{working ? 'Recording…' : 'Record Sale'}</button>
        </div>
      </form>
    </Modal>
  )
}
