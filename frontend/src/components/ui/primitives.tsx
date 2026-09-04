import React from 'react'
import { Ic, I } from './icons'

export const BADGE_MAP: Record<string, string> = {
  'Proceed': 'b-green', 'Active': 'b-green', 'Completed': 'b-green', 'Accepted': 'b-green',
  'Converted to Sale': 'b-green', 'Converted': 'b-green', 'Picked Up': 'b-green', 'Available': 'b-green',
  'Removed': 'b-red', 'Lost': 'b-red', 'Rejected': 'b-red', 'Overdue': 'b-red', 'Cancelled': 'b-red',
  'Validation Rejected': 'b-red', 'Quotation Rejected': 'b-red', 'Bounced': 'b-red', 'Hard Bounce': 'b-red',
  'Unsubscribed': 'b-red', 'Spam Complaint': 'b-red',
  'Pending': 'b-amber', 'Awaiting Response': 'b-amber', 'Under Review': 'b-amber', 'Pending Validation': 'b-amber',
  'Soft Bounce': 'b-amber',
  'New Inquiry': 'b-blue', 'Draft': 'b-blue', 'Call/Text': 'b-green', 'Quotation Created': 'b-blue',
  'Calls Only': 'b-blue', 'Mail Delivery Report': 'b-blue', 'Scheduled': 'b-blue', 'Confirmed': 'b-blue', 'Sent': 'b-blue',
  'Text Only': 'b-purple', 'Negotiating': 'b-purple', 'Negotiation': 'b-purple',
  'Quotation Required': 'b-amber', 'Quotation Sent': 'b-teal',
  'Unavailable': 'b-gray',
}

export const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${BADGE_MAP[status] || 'b-gray'}`}>{status}</span>
)

type SmartChipOption = { value: string; label: string; bg: string; color: string; dot: string }

const DEFAULT_SMART_STATUS_OPTIONS: SmartChipOption[] = [
  { value: 'Pending', label: 'Pending', bg: 'var(--amber-bg, #FEF3C7)', color: 'var(--amber, #92400E)', dot: '#D97706' },
  { value: 'Won', label: 'Won', bg: 'var(--green-bg, #D1FAE5)', color: 'var(--green, #065F46)', dot: '#059669' },
  { value: 'Cancelled', label: 'Cancelled', bg: 'var(--red-bg, #FEE2E2)', color: 'var(--red, #991B1B)', dot: '#DC2626' },
]

export const StatusSmartChip = ({
  status,
  onStatusChange,
  options = DEFAULT_SMART_STATUS_OPTIONS,
  disabled = false,
}: {
  status: string
  onStatusChange: (newStatus: string) => void
  options?: SmartChipOption[]
  disabled?: boolean
}) => {
  const normalized = (status || '').toLowerCase().trim()
  const current = options.find(option =>
    option.value.toLowerCase() === normalized
    || (normalized === 'converted to sale' && option.value === 'Won')
    || (normalized === 'lost' && option.value === 'Cancelled')
  ) || {
    value: status || 'Pending',
    label: status || 'Pending',
    bg: 'var(--s3)',
    color: 'var(--t2)',
    dot: 'var(--t4)',
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 9, width: 6, height: 6, borderRadius: '50%', background: current.dot, pointerEvents: 'none', zIndex: 1 }} />
      <select
        value={current.value}
        disabled={disabled}
        onChange={event => onStatusChange(event.target.value)}
        title={disabled ? undefined : 'Click to change status'}
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          background: current.bg, color: current.color,
          border: '1px solid rgba(0,0,0,0.08)', borderRadius: 999,
          padding: '2.5px 22px 2.5px 21px', fontSize: 11.5, fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer', outline: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center', transition: 'all 0.15s ease',
        }}
      >
        {options.map(option => (
          <option key={option.value} value={option.value} style={{ background: 'var(--ws)', color: 'var(--t1)', fontSize: 12, padding: 6 }}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export const Trend = ({ val, up, white }: { val: string | number; up?: boolean; white?: boolean }) => {
  const strVal = String(val)
  const isZero = strVal === '0' || strVal === '0%'
  const numericVal = parseFloat(strVal.replace(/[^0-9.-]+/g, "") || "0")
  const isUp = up !== undefined ? up : numericVal > 0
  const isDown = !isUp && numericVal < 0

  if (isZero) {
    return (
      <span className={`trend ${white ? 'trend-up-white' : 'trend-neutral'}`}>
        - {strVal}
      </span>
    )
  }

  return (
    <span className={`trend ${white ? 'trend-up-white' : isUp ? 'trend-up' : 'trend-down'}`}>
      {isUp ? '↑' : '↓'} {strVal}
    </span>
  )
}

export const Prog = ({ pct, color = '#315EF6', tall }: { pct: number; color?: string; tall?: boolean }) => {
  const safePct = isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div className={`prog${tall ? ' tall' : ''}`}>
      <div className="prog-fill" style={{ width: `${safePct}%`, background: color }} />
    </div>
  )
}

export const Divider = () => <div className="divider" />

export const EligDot = ({ on }: { on: boolean }) => (
  <div className="elig-dot" style={{ background: on ? '#059669' : '#E5E7EB' }} />
)

export const ChipPIC = ({ label }: { label: string }) => (
  <span style={{ background: 'var(--brand-bg)', color: 'var(--brand)', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{label}</span>
)
