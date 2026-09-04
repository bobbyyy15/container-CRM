import React from 'react'
import { Ic, I } from './icons'

export const BADGE_MAP: Record<string, string> = {
  'Proceed': 'b-green', 'Active': 'b-green', 'Completed': 'b-green', 'Accepted': 'b-green',
  'Converted to Sale': 'b-green', 'Converted': 'b-green', 'Picked Up': 'b-green',
  'Removed': 'b-red', 'Lost': 'b-red', 'Rejected': 'b-red', 'Overdue': 'b-red', 'Cancelled': 'b-red',
  'Validation Rejected': 'b-red', 'Quotation Rejected': 'b-red',
  'Pending': 'b-amber', 'Awaiting Response': 'b-amber', 'Under Review': 'b-amber', 'Pending Validation': 'b-amber',
  'New Inquiry': 'b-blue', 'Draft': 'b-blue', 'Call/Text': 'b-green', 'Quotation Created': 'b-blue',
  'Calls Only': 'b-blue', 'Mail Delivery Report': 'b-blue', 'Scheduled': 'b-blue', 'Confirmed': 'b-blue', 'Sent': 'b-blue',
  'Text Only': 'b-purple', 'Negotiating': 'b-purple', 'Negotiation': 'b-purple',
  'Quotation Required': 'b-amber', 'Quotation Sent': 'b-teal',
}

export const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${BADGE_MAP[status] || 'b-gray'}`}>{status}</span>
)

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
