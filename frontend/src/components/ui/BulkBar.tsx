import React from 'react'
import Btn from './Button'
import { Ic, I } from './icons'

/**
 * The "N selected · <actions> · Delete (N)" strip that appears in a grid's toolbar
 * once rows are checked. Delete is last and always present; anything stage-specific
 * goes in `children`, to its left.
 */
const BulkBar = ({
  count,
  busy,
  onDelete,
  deleteLabel = 'Delete',
  children,
}: {
  count: number
  busy?: boolean
  onDelete: () => void
  deleteLabel?: string
  children?: React.ReactNode
}) => {
  if (count === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--brand-bg)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
      {count} selected
      {children}
      <Btn variant="danger" sm disabled={busy} onClick={onDelete}>
        <Ic n={I.removed} size={12} /> {busy ? 'Deleting…' : `${deleteLabel} (${count})`}
      </Btn>
    </div>
  )
}

export default BulkBar
