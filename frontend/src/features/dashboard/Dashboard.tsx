import { BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, Trend, Prog } from '../../components/ui/primitives'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useCustomers } from '../../hooks/useCustomers'
import { useContracts } from '../../hooks/useContracts'
import { downloadPdfDocument } from '../../lib/exporters'
import type { Screen, ProfitChartPoint, ChartSlice, PicPerformanceRow, LossReasonRow } from '../../app/types'

const Dashboard = ({ onNav, session }: { onNav: (s: Screen) => void; session?: any }) => {
  const analytics = useAnalytics();
  const m = analytics?.metrics || {};
  const monthlyProfitTarget = Number(analytics?.targets?.monthly_gross_profit_target) || 0;
  const profitTargetPct = monthlyProfitTarget > 0 ? Math.round(((m.total_gross_profit || 0) / monthlyProfitTarget) * 100) : 0;
  const funnel = analytics?.funnel || {};
  const c = analytics?.charts || {};
  
  const profitChartData: ProfitChartPoint[] = c.profitChartData || [];
  const categoryData: ChartSlice[] = c.categoryData || [];
  const inquiryStatusData: ChartSlice[] = c.inquiryStatusData || [];
  const PIC_DATA: PicPerformanceRow[] = c.PIC_DATA || [];
  const LOSS_REASONS: LossReasonRow[] = c.LOSS_REASONS || [];

  const topCustomers = useCustomers('All', '', 0, 5);
  const overdueContracts = useContracts('All Statuses', 'Overdue', '');
  const OVERDUE_PICKUPS = overdueContracts.map(c => {
    const targetDate = c.pickup === 'Unscheduled' ? new Date() : new Date(c.pickup);
    const diff = Math.floor((new Date().getTime() - targetDate.getTime()) / (1000 * 3600 * 24));
    return { contract: c.ref, co: c.co, days: diff > 0 ? diff : 1, qty: c.qty, size: c.size };
  });
  const [chartMetric, setChartMetric] = useState<'profit' | 'revenue' | 'cost'>('profit')
  const chartColor = chartMetric === 'profit' ? '#315EF6' : chartMetric === 'revenue' ? '#059669' : '#6B7280'
  const conversion = (value: number, previous: number) => previous > 0 ? `${Math.round((value / previous) * 100)}%` : '0%'

  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userName = session?.user?.user_metadata?.full_name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'User'

  const [dateRange, setDateRange] = useState('This month')
  const [showDateMenu, setShowDateMenu] = useState(false)

  const rangePrefixMap: Record<string, string> = {
    'This month': 'Monthly',
    'This quarter': 'Quarterly',
    'This year': 'Annual',
    'All time': 'All Time'
  }
  const prefix = rangePrefixMap[dateRange] || 'Monthly'

  return (
    <div className="page-scroll">
      {/* Greeting */}
      <div className="greeting-bar">
        <div>
          <p className="greeting-title">{timeGreeting}, {userName}!</p>
          <p className="greeting-sub">Here's what's happening across your sales pipeline {dateRange.toLowerCase()}.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <div className="date-range" onClick={() => setShowDateMenu(!showDateMenu)}>
            <Ic n={I.calendar} size={13} />
            <span>{dateRange}</span>
            <Ic n={I.chevDown} size={12} />
          </div>
          {showDateMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowDateMenu(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 160, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {['This month', 'This quarter', 'This year', 'All time'].map(opt => (
                  <div key={opt} onClick={() => { setDateRange(opt); setShowDateMenu(false); }} style={{ padding: '8px 12px', borderRadius: 4, cursor: 'pointer', background: dateRange === opt ? 'var(--s2)' : 'transparent', color: dateRange === opt ? 'var(--brand)' : 'var(--t2)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = dateRange === opt ? 'var(--s2)' : 'transparent'}>
                    {opt}
                  </div>
                ))}
              </div>
            </>
          )}
          <Btn variant="ghost" sm onClick={() => void downloadPdfDocument({
            title: 'EXECUTIVE OVERVIEW REPORT',
            scope: `Container CRM | ${dateRange}`,
            filename: 'executive-overview',
            sections: [
              { title: 'Performance Summary', rows: [
                { Metric: 'Gross Profit',   Value: `$${(m.total_gross_profit || 0).toLocaleString()}` },
                { Metric: 'Revenue',        Value: `$${(m.total_revenue || 0).toLocaleString()}` },
                { Metric: 'Units Sold',     Value: m.total_units || 0 },
                { Metric: 'Active Clients', Value: m.active_clients || 0 },
                { Metric: 'Profit Margin',  Value: `${(m.profit_margin || 0).toFixed(1)}%` },
                { Metric: 'Monthly Target', Value: monthlyProfitTarget > 0 ? `$${monthlyProfitTarget.toLocaleString()} (${profitTargetPct}%)` : 'Not configured' },
              ]},
              { title: 'Sales Pipeline', rows: [
                { Stage: 'Prospects',  Count: funnel.prospects || 0 },
                { Stage: 'Warm Leads', Count: funnel.warm_leads || 0 },
                { Stage: 'Inquiries',  Count: funnel.inquiries || 0 },
                { Stage: 'Quotations', Count: funnel.quotations || 0 },
                { Stage: 'Sales Won',  Count: funnel.sales || 0 },
              ]},
              { title: 'Outreach Activity (This Month)', rows: [
                { Channel: 'Emails', Completed: analytics?.outreach?.emails || 0 },
                { Channel: 'Calls',  Completed: analytics?.outreach?.calls || 0 },
                { Channel: 'Texts',  Completed: analytics?.outreach?.texts || 0 },
              ]},
              { title: 'Performance by PIC', rows: (PIC_DATA || []).map(p => ({
                PIC: p.name, Sales: p.sales, Units: p.units,
                Revenue: `$${(p.revenue || 0).toLocaleString()}`,
                'Gross Profit': `$${(p.profit || 0).toLocaleString()}`,
                Emails: p.emails, Calls: p.calls, Texts: p.texts,
              })) },
              { title: 'Inquiry Status', rows: inquiryStatusData.map(d => ({ Status: d.name, Count: d.value })) },
            ],
          })}><Ic n={I.export} size={13} /> Export PDF</Btn>
        </div>
      </div>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Row 1: KPIs + Chart ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 2fr', gap: 12, alignItems: 'stretch' }}>
          {/* Featured KPI */}
          <div className="kpi-featured" style={{ background: 'linear-gradient(145deg, #2D4FE0 0%, #4C6FFF 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>{prefix} Gross Profit</span>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginBottom: 6 }}>${m.total_gross_profit?.toLocaleString() || 0}</div>
              <Trend val="0" white />
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                {monthlyProfitTarget > 0 ? `Target: $${monthlyProfitTarget.toLocaleString()} · ${profitTargetPct}%` : 'No monthly target configured'}
              </div>
              <div style={{ marginTop: 10, height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, profitTargetPct)}%`, background: 'rgba(255,255,255,0.8)', borderRadius: 99 }} />
              </div>
            </div>
          </div>

          {/* Secondary KPIs stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">{prefix} Revenue</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>${m.total_revenue?.toLocaleString() || 0}</div>
              <Trend val="0"/>
              <div className="kpi-sub">vs last month</div>
            </div>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Units Sold</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.total_units || 0}</div>
              <Trend val="0"/>
              <div className="kpi-sub">containers {dateRange.toLowerCase()}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Active Clients</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.active_clients || 0}</div>
              <Trend val="0"/>
              <div className="kpi-sub">purchased {dateRange.toLowerCase()}</div>
            </div>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">{prefix} Profit Margin</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.profit_margin?.toFixed(1) || 0}%</div>
              <Trend val="0"/>
              <div className="kpi-sub">vs previous {dateRange.replace('This ', '')}</div>
            </div>
          </div>

          {/* Main chart */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Gross Profit Performance</div>
                <div className="chart-sub">{prefix} trend — all PICs combined</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['profit', 'revenue', 'cost'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={`btn btn-xs${chartMetric === m ? ' btn-primary' : ' btn-ghost'}`}
                    style={{ textTransform: 'capitalize' }}
                  >{m}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={profitChartData} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--t4)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t4)' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `$${(v/1000).toFixed(0)}K`} width={40} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v: any) => [`$${Number(v).toLocaleString()}`, chartMetric]}
                />
                <Bar dataKey={chartMetric} fill={chartColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Row 2: Pipeline ── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Sales Pipeline</span>
            <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>Click a stage to navigate</span>
          </div>
          <div className="pipeline-row">
            {[
              { label: 'Prospects', count: funnel.prospects || 0, pct: '100%', change: '0%', screen: 'prospects' as Screen, color: '#315EF6' },
              { label: 'Warm Leads', count: funnel.warm_leads || 0, pct: conversion(funnel.warm_leads || 0, funnel.prospects || 0), change: '0%', screen: 'warm-leads' as Screen, color: '#7C3AED' },
              { label: 'Inquiries', count: funnel.inquiries || 0, pct: conversion(funnel.inquiries || 0, funnel.warm_leads || 0), change: '0%', screen: 'inquiries' as Screen, color: '#D97706' },
              { label: 'Quotations', count: funnel.quotations || 0, pct: conversion(funnel.quotations || 0, funnel.inquiries || 0), change: '0%', screen: 'quotations' as Screen, color: '#EA580C' },
              { label: 'Sales', count: funnel.sales || 0, pct: conversion(funnel.sales || 0, funnel.quotations || 0), change: '0%', screen: 'sales-tracker' as Screen, color: '#059669' },
            ].map((s, i) => (
              <div key={s.label} className="pipeline-stage" onClick={() => onNav(s.screen)}>
                {i > 0 && (
                  <div className="ps-arrow" style={{ color: 'var(--border)' }}>›</div>
                )}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 15, fontWeight: 800 }}>{s.count}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{s.pct} conversion</div>
                <Trend val={s.change} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 3: Outreach + Donut charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {/* Outreach progress */}
          <div className="chart-card">
            <div className="chart-title">Outreach Progress — This Month</div>
            <div className="chart-sub">Recorded on Daily Tasks, vs monthly target</div>
            {[
              { label: 'Emails', done: analytics?.outreach?.emails || 0, target: (Number(analytics?.targets?.daily_email_target) || 0) * (Number(analytics?.targets?.working_days_per_month) || 22), color: '#315EF6' },
              { label: 'Calls', done: analytics?.outreach?.calls || 0, target: (Number(analytics?.targets?.daily_call_target_preferred) || 0) * (Number(analytics?.targets?.working_days_per_month) || 22), color: '#0D9488' },
              { label: 'Texts / SMS', done: analytics?.outreach?.texts || 0, target: (Number(analytics?.targets?.daily_text_target) || 0) * (Number(analytics?.targets?.working_days_per_month) || 22), color: '#7C3AED' },
            ].map(o => (
              <div key={o.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--t2)' }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{o.done}</span> / {o.target > 0 ? o.target : '—'}
                  </span>
                </div>
                <Prog pct={o.target > 0 ? (o.done / o.target) * 100 : 0} color={o.color} tall />
              </div>
            ))}
          </div>

          {/* Inquiry status donut */}
          <div className="chart-card">
            <div className="chart-title">Inquiry Status</div>
            <div className="chart-sub">All open inquiries by status</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={inquiryStatusData} cx="50%" cy="50%" innerRadius={30} outerRadius={52} dataKey="value" paddingAngle={2}>
                    {inquiryStatusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {inquiryStatusData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, flex: 1, color: 'var(--t2)' }}>{d.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t1)' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category donut */}
          <div className="chart-card">
            <div className="chart-title">Sales by Container Category</div>
            <div className="chart-sub">{dateRange} · units</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={52} dataKey="value" paddingAngle={2}>
                    {categoryData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {categoryData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, flex: 1, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t1)' }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 4: Best Clients + PIC + Overdue ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 12 }}>
          {/* Best Clients */}
          <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="chart-title">Best Clients by Quantity</div>
                <div className="chart-sub" style={{ marginBottom: 0 }}>Top 5 this month</div>
              </div>
              <Btn variant="ghost" sm onClick={() => onNav('best-clients')}>View All →</Btn>
            </div>
            <table className="crm" style={{ width: '100%' }}>
              <thead><tr><th>#</th><th>Company</th><th className="r">Units</th><th className="r">Profit</th></tr></thead>
              <tbody>
                                {topCustomers.map((row, idx) => (
                  <tr key={row.id}>
                    <td style={{ width: 36 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: idx === 0 ? '#FEF3C7' : 'var(--s3)', color: idx === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{idx + 1}</span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{row.co}</td>
                    <td className="r mono" style={{ fontWeight: 700 }}>{row.units}</td>
                    <td className="r profit-cell">${row.profit.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PIC Performance */}
          <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="chart-title">PIC Performance</div>
              <Btn variant="ghost" sm onClick={() => onNav('pic-performance')}>View All →</Btn>
            </div>
            <div style={{ padding: '10px 18px 14px' }}>
              {PIC_DATA.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < PIC_DATA.length - 1 ? 12 : 0 }}>
                  <div className="avatar" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 10, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i] }}>{p.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{p.name.split(' ')[0]}</span>
                      <span className="profit-cell" style={{ fontSize: 12 }}>${p.profit.toLocaleString()}</span>
                    </div>
                    <Prog pct={(p.sales / 10) * 100} color={['#315EF6','#7C3AED','#0D9488','#D97706'][i]} />
                    <div style={{ fontSize: 10.5, color: 'var(--t4)', marginTop: 3 }}>{p.sales} sales · {p.units} units</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Overdue Pickups */}
          <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic n={I.warning} size={13} style={{ color: OVERDUE_PICKUPS.length > 0 ? 'var(--red)' : 'var(--t4)' }} />
                  Overdue Pickups
                </div>
                <div className="chart-sub" style={{ marginBottom: 0 }}>{OVERDUE_PICKUPS.length > 0 ? 'Requires immediate action' : 'All clear'}</div>
              </div>
              <Btn variant="ghost" sm onClick={() => onNav('pickups')}>View All →</Btn>
            </div>
            <div style={{ padding: '12px 18px' }}>
              {OVERDUE_PICKUPS.map(r => (
                <div key={r.contract} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-s)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)' }}>{r.co}</span>
                    <span className="badge b-red" style={{ fontSize: 10.5 }}>{r.days} days overdue</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{r.contract} · {r.qty}× {r.size}</div>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: '8px 12px', background: OVERDUE_PICKUPS.length > 0 ? 'var(--red-bg)' : 'var(--s2)', borderRadius: 8, fontSize: 12, color: OVERDUE_PICKUPS.length > 0 ? 'var(--red)' : 'var(--t3)', fontWeight: 500 }}>
                {OVERDUE_PICKUPS.length > 0 
                  ? `${OVERDUE_PICKUPS.length} overdue · Total delay risk on ${OVERDUE_PICKUPS.reduce((acc, curr) => acc + curr.qty, 0)} containers`
                  : '0 overdue pickups · No current delay risk'}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}


export default Dashboard
