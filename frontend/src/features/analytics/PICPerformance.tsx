import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useAnalytics } from '../../hooks/useAnalytics'
import type { PicPerformanceRow } from '../../app/types'

const PICPerformance = () => {
  const analytics = useAnalytics();
  const PIC_DATA: PicPerformanceRow[] = analytics?.charts?.PIC_DATA || [];
  return (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 16 }}>
      <p className="greeting-title">PIC Performance</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Not a dropdown: PIC_DATA is computed server-side for the current calendar
            month only, so there's nothing to select yet. */}
        <div className="date-range" style={{ cursor: 'default' }} title="Scored on the current calendar month">
          <Ic n={I.calendar} size={13} /><span>This Month</span>
        </div>
        <ExportMenu data={PIC_DATA} filename="pic_performance" />
      </div>
    </div>
    <div className="page-content" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {PIC_DATA.map((p, i) => (
          <div key={p.name} className="kpi-featured" style={{ background: ['#2D4FE0','#6D28D9','#065F46','#92400E'][i] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{p.name}</span>
              <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: 'rgba(255,255,255,0.2)', color: 'white' }}>{p.initials}</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>${p.profit.toLocaleString()}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{p.sales} sales · {p.units} units</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="crm">
          <thead><tr>
            <th>#</th><th>PIC</th><th className="r">Calls</th><th className="r">Emails</th>
            <th className="r">Texts</th><th className="r">Warm Leads</th><th className="r">Inquiries</th>
            <th className="r">Quotes</th><th className="r">Sales</th><th className="r">Units</th>
            <th className="r">Revenue</th><th className="r">Gross Profit</th>
          </tr></thead>
          <tbody>
            {PIC_DATA.map((p, i) => (
              <tr key={p.name}>
                <td>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#FEF3C7' : 'var(--s3)', color: i === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i] }}>{p.initials}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.name}</span>
                  </div>
                </td>
                <td className="r mono">{p.calls}</td>
                <td className="r mono">{p.emails.toLocaleString()}</td>
                <td className="r mono">{p.texts}</td>
                <td className="r mono bold">{p.leads}</td>
                <td className="r mono bold">{p.inquiries}</td>
                <td className="r mono">{p.quotes}</td>
                <td className="r mono bold">{p.sales}</td>
                <td className="r mono bold">{p.units}</td>
                <td className="r revenue-cell">${p.revenue.toLocaleString()}</td>
                <td className="r profit-cell">${p.profit.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}


export default PICPerformance
