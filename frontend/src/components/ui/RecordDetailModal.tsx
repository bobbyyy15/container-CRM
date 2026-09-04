import React from 'react'
import Btn from './Button'
import { Ic, I } from './icons'
import type { DetailField } from '../../app/types'

const RecordDetailModal = ({ title, fields, onClose, footerExtra }: { title: string; fields: DetailField[]; onClose: () => void; footerExtra?: React.ReactNode }) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title">{title}</div>
        <Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn>
      </div>
      <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {fields.map(f => (
          <div key={f.label} style={{ gridColumn: f.label.length > 24 ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>{f.value ?? <span style={{ color: 'var(--t4)' }}>—</span>}</div>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        {footerExtra}
      </div>
    </div>
  </div>
)


export default RecordDetailModal
