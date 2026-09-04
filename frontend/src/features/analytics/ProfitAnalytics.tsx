import { BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useAnalytics } from '../../hooks/useAnalytics'
import type { ProfitChartPoint } from '../../app/types'

const ProfitAnalytics = () => {
  const analytics = useAnalytics();
  const profitChartData: ProfitChartPoint[] = analytics?.charts?.profitChartData || [];
  const revenue = analytics?.metrics?.total_revenue ?? 0;
  const grossProfit = analytics?.metrics?.total_gross_profit ?? 0;
  // Buying cost isn't returned separately -- it's the difference by definition, since
  // gross_profit is computed as revenue - buying_cost when a sale is recorded.
  const buyingCost = revenue - grossProfit;
  const margin = analytics?.metrics?.profit_margin ?? 0;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 0 }}>
      <p className="greeting-title">Profit Analytics</p>
      {/* Not a dropdown: these KPIs are all-time totals, not year-scoped -- labeled
          accordingly rather than a "2024 YTD" claim the numbers don't back up. */}
      <div className="date-range" style={{ cursor: 'default' }} title="All-time totals">
        <Ic n={I.calendar} size={13} /><span>All-Time</span>
      </div>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Revenue', val: money(revenue), color: 'var(--brand)' },
          { label: 'Total Buying Cost', val: money(buyingCost), color: 'var(--t3)' },
          { label: 'Total Gross Profit', val: money(grossProfit), color: 'var(--green)' },
          { label: 'Avg Profit Margin', val: `${margin.toFixed(1)}%`, color: 'var(--teal)' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">Monthly Gross Profit vs Revenue</div>
            <div className="chart-sub">$5,000/month target line shown as dashed</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={profitChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
            <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--t4)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--t4)' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `$${(v/1000).toFixed(0)}K`} width={40} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']} />
            <Area type="monotone" dataKey="revenue" stroke="#315EF6" fill="#315EF608" strokeWidth={2} name="Revenue" />
            <Area type="monotone" dataKey="profit" stroke="#059669" fill="#05966910" strokeWidth={2} name="Profit" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
  );
}


export default ProfitAnalytics
