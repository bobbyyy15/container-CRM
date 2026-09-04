import React, { useState } from 'react'
import Btn from './Button'
import { Ic, I } from './icons'
import { usePics } from '../../features/pipeline/PipelineDialogs'

const AssignPicModal = ({ count, onClose, onAssign }: { count: number; onClose: () => void; onAssign: (picId: string) => void }) => {
  const pics = usePics()
  const [picId, setPicId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Assign PIC</div>
          <Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Reassign {count} selected record{count === 1 ? '' : 's'} to:</p>
          <select className="inp" value={picId} onChange={e => setPicId(e.target.value)}>
            <option value="">-- Select a PIC --</option>
            {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" disabled={!picId || submitting} onClick={async () => { setSubmitting(true); await onAssign(picId) }}>
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}


export default AssignPicModal
