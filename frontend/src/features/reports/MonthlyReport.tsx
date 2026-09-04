import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { downloadPdfDocument } from '../../lib/exporters'

const money = (n: any) => `$${Math.round(Number(n) || 0).toLocaleString()}`

const num = (n: any) => (Number(n) || 0).toLocaleString()


const reportTabs = (r: any) => {
  const s = r.summary || {}, p = r.pipeline || {}, o = r.outreach || {}, t = r.targets || {}
  return [
    {
      name: 'Summary',
      rows: [
        { Metric: 'Revenue',              Value: Number(s.revenue) || 0 },
        { Metric: 'Buying cost',          Value: Number(s.buying_cost) || 0 },
        { Metric: 'Gross profit',         Value: Number(s.gross_profit) || 0 },
        { Metric: 'Profit margin %',      Value: Number(s.margin) || 0 },
        { Metric: 'Units sold',           Value: Number(s.units) || 0 },
        { Metric: 'Deals won',            Value: Number(s.deals_won) || 0 },
        { Metric: 'Average deal size',    Value: Number(s.avg_deal) || 0 },
        { Metric: 'Previous month profit', Value: Number(s.prev_gross_profit) || 0 },
        { Metric: 'Profit change %',      Value: s.profit_change_pct ?? 'n/a' },
        { Metric: 'Gross profit target',  Value: Number(t.monthly_gross_profit_target) || 0 },
      ],
    },
    {
      name: 'Pipeline',
      rows: [
        { Stage: 'New prospects',  Count: Number(p.prospects) || 0 },
        { Stage: 'Warm leads',     Count: Number(p.warm_leads) || 0 },
        { Stage: 'Inquiries',      Count: Number(p.inquiries) || 0 },
        { Stage: 'Quotations',     Count: Number(p.quotations) || 0 },
        { Stage: 'Sales won',      Count: Number(p.sales) || 0 },
      ],
    },
    {
      name: 'Outreach',
      rows: [
        { Channel: 'Emails sent',    Completed: Number(o.emails) || 0, Target: Number(t.monthly_email_target) || 0, Replies: Number(o.email_replies) || 0 },
        { Channel: 'Calls made',     Completed: Number(o.calls) || 0,  Target: Number(t.monthly_call_target) || 0,  Replies: Number(o.calls_answered) || 0 },
        { Channel: 'Texts sent',     Completed: Number(o.texts) || 0,  Target: Number(t.monthly_text_target) || 0,  Replies: Number(o.text_replies) || 0 },
        { Channel: 'Days logged',    Completed: Number(o.days_logged) || 0, Target: Number(t.working_days_per_month) || 0, Replies: '' },
      ],
    },
    {
      name: 'PIC Breakdown',
      rows: (r.pic_breakdown || []).map((x: any) => ({
        PIC: x.name, Deals: x.deals, Units: x.units,
        Revenue: Number(x.revenue) || 0, 'Gross profit': Number(x.gross_profit) || 0,
        Emails: x.emails, Calls: x.calls, Texts: x.texts,
      })),
    },
    {
      name: 'Top Customers',
      rows: (r.top_customers || []).map((x: any) => ({
        Company: x.company, Deals: x.deals, Units: x.units,
        Revenue: Number(x.revenue) || 0, 'Gross profit': Number(x.gross_profit) || 0,
      })),
    },
    {
      name: 'Loss Reasons',
      rows: (r.loss_reasons || []).map((x: any) => ({ Reason: x.reason, Count: x.count })),
    },
  ]
}

const MonthlyReport = () => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/monthly', { params: { month } })
      .then(res => { if (res.data.success) setReport(res.data.data) })
      .catch(e => toast(e.response?.data?.error?.message ?? 'Could not load the report.', 'error'))
      .finally(() => setLoading(false))
  }, [month])

  const filename = report ? `Monthly Report ${report.month_label}` : 'Monthly Report'

  const exportExcel = async () => {
    if (!report) return
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const tab of reportTabs(report)) {
        if (!tab.rows.length) continue
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tab.rows), tab.name)
      }
      XLSX.writeFile(wb, `${filename}.xlsx`)
    } catch {
      toast('Could not build the Excel file.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const exportSheet = async () => {
    if (!report) return
    setExporting(true)
    toast('Creating your Google Sheet…', 'info')
    try {
      const res = await api.post('/export/google-workbook', { title: filename, tabs: reportTabs(report) })
      const url = res.data.data?.url
      if (url) {
        window.open(url, '_blank', 'noopener')
        toast(`Sheet created with ${res.data.data.tabs} tabs.`, 'success')
      }
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Google Sheets export failed.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // Same tabular document as every other PDF export, driven by the exact sections
  // the Excel and Google Sheets exports use -- so all three stay identical.
  const exportPDF = () => void downloadPdfDocument({
    title: 'MONTHLY PERFORMANCE REPORT',
    filename,
    scope: `Container CRM | ${report.month_label} | ${report.scope === 'personal' ? 'Personal' : 'Organization-wide'}`,
    sections: reportTabs(report).map(t => ({ title: t.name, rows: t.rows })),
  })

  if (loading) return <div className="loading-row"><span className="spinner" />Building report…</div>
  if (!report) return <div className="empty"><div className="empty-title">No report available</div></div>

  const s = report.summary || {}, p = report.pipeline || {}, o = report.outreach || {}, t = report.targets || {}
  const profitTarget = Number(t.monthly_gross_profit_target) || 0
  const profitPct = profitTarget > 0 ? Math.round((Number(s.gross_profit) / profitTarget) * 100) : null
  const change = s.profit_change_pct

  const exportOptions = [
    { label: 'PDF',           run: exportPDF },
    { label: 'Excel (.xlsx)', run: exportExcel },
    { label: 'Google Sheet',  run: exportSheet },
  ]

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="card report-block" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div className="page-scroll">
      <div className="page-header no-print">
        <div>
          <div className="page-title">Monthly Report</div>
          <div className="page-desc">
            {report.scope === 'personal' ? 'Your own figures' : 'Organization-wide'} · generated {new Date(report.generated_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="inp sm" type="month" value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ width: 160 }}
          />
          <div style={{ position: 'relative' }}>
            <Btn variant="primary" sm onClick={() => setMenuOpen(o => !o)} disabled={exporting}>
              <Ic n={I.export} size={13} /> {exporting ? 'Exporting…' : 'Export'} <Ic n={I.chevDown} size={11} />
            </Btn>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 170, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
                  {exportOptions.map(opt => (
                    <div
                      key={opt.label}
                      onClick={() => { setMenuOpen(false); opt.run() }}
                      style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--t2)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-content report-sheet">
        {/* Print-only masthead -- the app chrome is hidden on paper, so the document
            needs to identify itself. */}
        <div className="print-only report-masthead">
          <div style={{ fontSize: 20, fontWeight: 800 }}>Container CRM — Monthly Report</div>
          <div style={{ fontSize: 13, color: '#555' }}>
            {report.month_label} · {report.scope === 'personal' ? 'Personal figures' : 'Organization-wide'} · generated {new Date(report.generated_at).toLocaleDateString()}
          </div>
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', marginBottom: 12 }}>{report.month_label}</div>

        {/* Headline numbers */}
        <div className="report-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'Revenue',      val: money(s.revenue),      color: 'var(--brand)' },
            { label: 'Buying cost',  val: money(s.buying_cost),  color: 'var(--t3)' },
            { label: 'Gross profit', val: money(s.gross_profit), color: 'var(--green)' },
            { label: 'Margin',       val: `${Number(s.margin) || 0}%`, color: 'var(--teal)' },
          ].map(k => (
            <div key={k.label} className="kpi-card report-block">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        <Section title="Performance against target">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { k: 'Deals won', v: num(s.deals_won) },
              { k: 'Units sold', v: num(s.units) },
              { k: 'Average deal', v: money(s.avg_deal) },
              {
                k: 'vs last month',
                v: change === null || change === undefined ? '—' : `${change > 0 ? '+' : ''}${change}%`,
                color: change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : undefined,
              },
            ].map(x => (
              <div key={x.k}>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>{x.k}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (x as any).color || 'var(--t1)' }}>{x.v}</div>
              </div>
            ))}
          </div>
          {profitTarget > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)', marginBottom: 5 }}>
                <span>Gross profit target</span>
                <span>{money(s.gross_profit)} of {money(profitTarget)} · {profitPct}%</span>
              </div>
              <div className="prog"><div className="prog-fill" style={{ width: `${Math.min(100, profitPct ?? 0)}%`, background: (profitPct ?? 0) >= 100 ? 'var(--green)' : 'var(--brand)' }} /></div>
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--t4)' }}>
              No profit target configured — set one in Daily Targets to track progress here.
            </div>
          )}
        </Section>

        <Section title="Pipeline created this month">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[
              { k: 'Prospects', v: p.prospects }, { k: 'Warm leads', v: p.warm_leads },
              { k: 'Inquiries', v: p.inquiries }, { k: 'Quotations', v: p.quotations },
              { k: 'Sales won', v: p.sales },
            ].map(x => (
              <div key={x.k} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--s2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>{num(x.v)}</div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{x.k}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Outreach activity">
          {Number(o.days_logged) === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--t4)' }}>
              No outreach was logged for this month. Activity is recorded on the Daily Tasks screen.
            </div>
          ) : (
            <table className="crm">
              <thead><tr><th>Channel</th><th className="r">Completed</th><th className="r">Target</th><th className="r">Replies / Answered</th><th className="r">Completion</th></tr></thead>
              <tbody>
                {[
                  { c: 'Emails', done: o.emails, tgt: t.monthly_email_target, rep: o.email_replies },
                  { c: 'Calls',  done: o.calls,  tgt: t.monthly_call_target,  rep: o.calls_answered },
                  { c: 'Texts',  done: o.texts,  tgt: t.monthly_text_target,  rep: o.text_replies },
                ].map(r => {
                  const pct = Number(r.tgt) > 0 ? Math.round((Number(r.done) / Number(r.tgt)) * 100) : null
                  return (
                    <tr key={r.c}>
                      <td style={{ fontWeight: 600 }}>{r.c}</td>
                      <td className="r mono">{num(r.done)}</td>
                      <td className="r mono">{Number(r.tgt) > 0 ? num(r.tgt) : '—'}</td>
                      <td className="r mono">{num(r.rep)}</td>
                      <td className="r mono" style={{ color: pct === null ? 'var(--t4)' : pct >= 100 ? 'var(--green)' : 'var(--t2)' }}>
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {(report.pic_breakdown || []).length > 0 && (
          <Section title="Performance by PIC">
            <table className="crm">
              <thead><tr>
                <th>PIC</th><th className="r">Deals</th><th className="r">Units</th>
                <th className="r">Revenue</th><th className="r">Gross profit</th>
                <th className="r">Emails</th><th className="r">Calls</th><th className="r">Texts</th>
              </tr></thead>
              <tbody>
                {report.pic_breakdown.map((x: any) => (
                  <tr key={x.name}>
                    <td style={{ fontWeight: 600 }}>{x.name}</td>
                    <td className="r mono">{num(x.deals)}</td>
                    <td className="r mono">{num(x.units)}</td>
                    <td className="r mono">{money(x.revenue)}</td>
                    <td className="r mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{money(x.gross_profit)}</td>
                    <td className="r mono">{num(x.emails)}</td>
                    <td className="r mono">{num(x.calls)}</td>
                    <td className="r mono">{num(x.texts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {(report.top_customers || []).length > 0 && (
          <Section title="Top customers by gross profit">
            <table className="crm">
              <thead><tr><th>Company</th><th className="r">Deals</th><th className="r">Units</th><th className="r">Revenue</th><th className="r">Gross profit</th></tr></thead>
              <tbody>
                {report.top_customers.map((x: any) => (
                  <tr key={x.company}>
                    <td style={{ fontWeight: 600 }}>{x.company}</td>
                    <td className="r mono">{num(x.deals)}</td>
                    <td className="r mono">{num(x.units)}</td>
                    <td className="r mono">{money(x.revenue)}</td>
                    <td className="r mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{money(x.gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {(report.loss_reasons || []).length > 0 && (
          <Section title="Why inquiries were lost">
            <table className="crm">
              <thead><tr><th>Reason</th><th className="r">Count</th></tr></thead>
              <tbody>
                {report.loss_reasons.map((x: any) => (
                  <tr key={x.reason}>
                    <td>{x.reason}</td>
                    <td className="r mono" style={{ fontWeight: 700 }}>{num(x.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </div>
  )
}


export default MonthlyReport
