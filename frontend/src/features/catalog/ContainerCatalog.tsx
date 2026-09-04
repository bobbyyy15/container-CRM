import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useCatalogList } from '../../hooks/useCatalogList'

const ContainerCatalog = () => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')

  return (
    <div className="page-scroll">
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 0 }}>
          <div>
            <div className="page-title">Container Catalog</div>
            <div className="page-desc">Sizes and condition grades offered on quotations and inquiries. This CRM doesn't track physical unit inventory -- pricing is set per quotation.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Available Sizes</div>
            {sizes.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {sizes.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No sizes configured.</div>}
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Condition Grades</div>
            {conditions.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {conditions.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No condition grades configured.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}


export default ContainerCatalog
