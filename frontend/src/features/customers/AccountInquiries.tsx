import React from 'react'
import { Badge } from '../../components/ui/primitives'
import type { BadgeStatus } from '../../app/types'
import { useInquiries } from '../../hooks/useInquiries'

/**
 * The inquiries behind an Active Client, each one opening that inquiry.
 *
 * Inquiries tied to this account come first. Inquiries from the same company that are not
 * tied to any account are listed apart, labelled as such -- when the company holds more
 * than one account they cannot be attributed to this one.
 */
const AccountInquiries = ({ accountId, companyId, onOpen }: {
  accountId: string
  companyId: string
  onOpen?: (inquiryId: string) => void
}) => {
  const inquiries = useInquiries(0, 'all')
  const newestFirst = (a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  const linked = inquiries.filter(row => row.customerAccountId === accountId).sort(newestFirst)
  const companyOnly = inquiries.filter(row => !row.customerAccountId && row.companyId === companyId).sort(newestFirst)

  const table = (rows: any[]) => (
    <div style={{ maxHeight: 190, overflow: 'auto', border: '1px solid var(--border-s)', borderRadius: 8 }}>
      <table className="crm" style={{ width: '100%' }}>
        <thead><tr><th>Inquiry</th><th>Date</th><th>Size</th><th>Condition</th><th className="r">Qty</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>
                {onOpen ? (
                  <button
                    type="button"
                    className="ref-id"
                    style={{ border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    title={`Open ${row.ref}`}
                    onClick={() => onOpen(row.id)}
                  >
                    {row.ref}
                  </button>
                ) : <span className="ref-id">{row.ref}</span>}
              </td>
              <td className="mono" style={{ fontSize: 11.5 }}>{row.date}</td>
              <td style={{ fontSize: 12 }}>{row.size}</td>
              <td style={{ fontSize: 12 }}>{row.condition}</td>
              <td className="r mono" style={{ fontSize: 12 }}>{row.qty}</td>
              <td><Badge status={row.status as BadgeStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const heading: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px' }

  return (
    <div style={{ borderTop: '1px solid var(--border-s)', paddingTop: 12, display: 'grid', gap: 12 }}>
      <div>
        <div style={heading}>Inquiries for this account</div>
        {inquiries.loading && inquiries.length === 0
          ? <div style={{ fontSize: 12.5, color: 'var(--t4)' }}>Loading inquiries…</div>
          : linked.length === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--t4)' }}>No inquiries are tied to this account.</div>
            : table(linked)}
      </div>
      {companyOnly.length > 0 && (
        <div>
          <div style={heading}>Company inquiries not tied to an account</div>
          {table(companyOnly)}
        </div>
      )}
    </div>
  )
}

export default AccountInquiries
