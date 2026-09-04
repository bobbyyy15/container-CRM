import React, { useState, useRef } from 'react'
import Btn from './Button'
import { Ic, I } from './icons'
import { exportToCSV, exportToExcel, exportToGoogleSheet, exportToPDF } from '../../lib/exporters'

const ExportMenu = ({ data, filename, sm = true }: { data: any[]; filename: string; sm?: boolean }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLDivElement>(null)

  const options = [
    { label: 'PDF',           icon: I.export, run: () => exportToPDF(data, filename) },
    { label: 'CSV file',      icon: I.export, run: () => exportToCSV(data, filename) },
    { label: 'Excel (.xlsx)', icon: I.export, run: () => exportToExcel(data, filename) },
    { label: 'Google Sheet',  icon: I.link,   run: () => exportToGoogleSheet(data, filename) },
  ]

  // Positioned fixed against the button's viewport rect rather than absolutely inside
  // it -- toolbars and table wrappers clip an absolutely positioned menu.
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={btnRef} style={{ position: 'relative' }}>
      <Btn variant="ghost" sm={sm} onClick={toggle}>
        <Ic n={I.export} size={13} /> Export <Ic n={I.chevDown} size={11} />
      </Btn>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, right: pos.right, width: 180, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 2000, boxShadow: 'var(--shadow-drop)' }}>
            {options.map(o => (
              <div
                key={o.label}
                onClick={() => { setOpen(false); o.run() }}
                style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--t2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Ic n={o.icon} size={13} style={{ color: 'var(--t4)' }} />
                {o.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ExportMenu
