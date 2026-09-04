import { BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import React, { useState, useEffect } from 'react'
import { Ic, I } from '../../components/ui/icons'
import { Prog } from '../../components/ui/primitives'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useInquiries } from '../../hooks/useInquiries'
import type { LossReasonRow } from '../../app/types'

const InquiryDashboard = () => {
  const analytics = useAnalytics();
  const LOSS_REASONS: LossReasonRow[] = analytics?.charts?.LOSS_REASONS || [];
  const inquiries = useInquiries(0, 'all')
  const total = inquiries.length
  const pendingValidation = inquiries.filter(r => r.status === 'Pending Validation').length
  const validationRejected = inquiries.filter(r => r.status === 'Validation Rejected').length
  const underReview = inquiries.filter(r => r.status === 'Under Review').length
  const quotationCreated = inquiries.filter(r => r.status === 'Quotation Created').length
  const convertedToSale = inquiries.filter(r => r.status === 'Converted to Sale').length
  const funnelTotal = underReview + quotationCreated + convertedToSale
  const pct = (v: number) => funnelTotal > 0 ? Math.round((v / funnelTotal) * 100) : 0
  return (
  <div className="page-scroll">
    <div className="greeting-bar">
      <p className="greeting-title">Inquiry Dashboard</p>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Inquiries', val: String(total) },
          { label: 'Pending Validation', val: String(pendingValidation) },
          { label: 'Approved / Under Review', val: String(underReview) },
          { label: 'Converted to Sale', val: String(convertedToSale) },
          { label: 'Validation Rejected', val: String(validationRejected) },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 26 }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="chart-card">
          <div className="chart-title">Inquiry Conversion Funnel</div>
          <div className="chart-sub" style={{ marginBottom: 14 }}>Approved tickets, by stage</div>
          {[
            { label: 'Under Review', v: underReview, pct: pct(underReview), color: '#315EF6' },
            { label: 'Quotation Created', v: quotationCreated, pct: pct(quotationCreated), color: '#0D9488' },
            { label: 'Converted to Sale', v: convertedToSale, pct: pct(convertedToSale), color: '#059669' },
          ].map(r => (
            <div key={r.label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>{r.label}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{r.v}</span>
                  <span style={{ fontSize: 11, color: 'var(--t4)', width: 32, textAlign: 'right' }}>{r.pct}%</span>
                </div>
              </div>
              <Prog pct={r.pct} color={r.color} />
            </div>
          ))}
        </div>
        <div className="chart-card">
          <div className="chart-title">Loss Reason Analysis</div>
          <div className="chart-sub" style={{ marginBottom: 14 }}>Why inquiries were lost</div>
          {LOSS_REASONS.map(r => (
            <div key={r.reason} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5 }}>{r.reason}</span>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: r.color }}>{r.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
}


export default InquiryDashboard
