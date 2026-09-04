import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useInquiryBoard } from '../../hooks/useInquiryBoard'
import { useCatalogList } from '../../hooks/useCatalogList'
import type { AlternativeOffer } from '../../app/types'

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


export default InquiryValidation
