import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useInquiries } from '../../hooks/useInquiries'

const INQUIRY_FUNNEL_STAGES = [
  { statuses: ['Under Review'], label: 'Under Review', color: '#315EF6' },
  { statuses: ['Quotation Created'], label: 'Quotation Created', color: '#7C3AED' },
  { statuses: ['Converted to Sale'], label: 'Converted to Sale', color: '#059669' },
]

const InquiryFunnel = () => {
  const inquiries = useInquiries(0, 'all')
  const stageCounts = INQUIRY_FUNNEL_STAGES.map(stage => ({
    ...stage,
    count: inquiries.filter(r => stage.statuses.includes(r.status)).length,
  }))
  const total = stageCounts.reduce((sum, s) => sum + s.count, 0)
  const lostCount = inquiries.filter(r => ['Lost', 'Removed'].includes(r.status)).length
  const maxCount = Math.max(1, ...stageCounts.map(s => s.count))

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Inquiry Funnel</div>
            <div className="page-desc">Where {total} tracked inquiries stand today, stage by stage.</div>
          </div>
        </div>
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stageCounts.map((s, i) => {
              const pctOfMax = (s.count / maxCount) * 100
              const pctOfTotal = total > 0 ? (s.count / total) * 100 : 0
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2)' }}>{i + 1}. {s.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{s.count} <span style={{ color: 'var(--t4)', fontWeight: 500 }}>({pctOfTotal.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 22, borderRadius: 6, background: 'var(--s2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctOfMax}%`, background: s.color, borderRadius: 6, transition: 'width 0.3s ease', minWidth: s.count > 0 ? 4 : 0 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Total Tracked Inquiries</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{total}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Converted to Sale</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{stageCounts[stageCounts.length - 1].count}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Lost / Removed</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--mono)' }}>{lostCount}</div>
          </div>
        </div>
      </div>
    </div>
  )
}


export default InquiryFunnel
