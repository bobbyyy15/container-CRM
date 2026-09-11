import { BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Trend, Prog } from '../../components/ui/primitives'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useProspects } from '../../hooks/useProspects'
import { downloadPdfDocument } from '../../lib/exporters'
import { isAdminRole, scopedLabel } from '../../lib/scope'

const OutreachDashboard = ({ role }: { role?: string }) => {
  const analytics = useAnalytics()
  // The API scopes these to the caller's PIC unless they are an admin, so the labels say
  // whose numbers they are rather than implying the whole company's.
  const isAdmin = isAdminRole(role)
  const mine = (label: string) => scopedLabel(label, role)
  const m = analytics?.metrics || {}
  const prospects = useProspects() || []
  
  const eligibleContacts = prospects.filter((p: any) => p.status !== 'Removed').length
  const excludedContacts = prospects.length - eligibleContacts

  const outreach = analytics?.outreach || {}
  const targets = analytics?.targets || {}

  const profitDone = m.total_gross_profit || 0
  const profitTarget = Number(targets.monthly_gross_profit_target) || 0

  // Straight-line run rate for the rest of the month: what this month lands at if
  // the current daily pace holds. Replaces a flat 1.15x multiplier that was invented.
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const projectedProfit = Math.round(profitDone / dayOfMonth * daysInMonth)
  const projectedPct = profitTarget > 0 ? Math.round((projectedProfit / profitTarget) * 100) : 0

  // Daily targets scaled to the configured number of working days, since this view
  // reports month-to-date completion.
  const workingDays = Number(targets.working_days_per_month) || 22
  const emailDone = outreach.emails || 0, emailTarget = (Number(targets.daily_email_target) || 0) * workingDays
  const callsDone = outreach.calls || 0,  callsPref   = (Number(targets.daily_call_target_preferred) || 0) * workingDays
  const callsMin = (Number(targets.daily_call_target_min) || 0) * workingDays
  const textsDone = outreach.texts || 0,  textsTarget = (Number(targets.daily_text_target) || 0) * workingDays

  const safePct = (done: number, tgt: number) => tgt > 0 ? Math.round((done / tgt) * 100) : 0

  // A target of 0 means nobody has filled in Configuration -> Daily Targets, not
  // that the goal has been met. Saying "On Track" against a goal that does not
  // exist -- with a full progress bar, because done/0 is Infinity -- claimed
  // progress that had never been measured, so every card checks for it.
  const noTarget = (tgt: number) => !(tgt > 0)

  // Status badge for a channel: unset target first, then met, then in progress.
  const targetStatus = (done: number, tgt: number, met: string, going: string) =>
    noTarget(tgt) ? { badgeLabel: 'No target set', badgeCls: 'b-gray' }
      : safePct(done, tgt) >= 100 ? { badgeLabel: met, badgeCls: null }
      : { badgeLabel: going, badgeCls: null }

  // Remaining is only meaningful against a real target. Without one it went
  // negative (-1500 against a target of 0), which read as a deficit.
  const remaining = (done: number, tgt: number) => noTarget(tgt) ? '—' : Math.max(0, tgt - done)

  const pctLabel = (done: number, tgt: number) => noTarget(tgt) ? '—' : `${safePct(done, tgt)}%`

  const [dateRange, setDateRange] = useState('This month')
  const [showDateMenu, setShowDateMenu] = useState(false)
  const rangePrefixMap: Record<string, string> = { 'This month': 'Monthly', 'This quarter': 'Quarterly', 'This year': 'Annual', 'All time': 'All Time' }
  const prefix = rangePrefixMap[dateRange] || 'Monthly'

  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
  const todayStr = new Date().toLocaleDateString('en-US', dateOptions);

  return (
    <div className="page-scroll">
      <div className="greeting-bar">
        <div>
          <p className="greeting-title">{mine('Outreach dashboard')}</p>
          <p className="greeting-sub">Daily targets, outreach completion, and profit progress — {todayStr}</p>
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
            title: isAdmin ? 'OUTREACH PERFORMANCE REPORT' : 'MY OUTREACH PERFORMANCE REPORT',
            scope: `Container CRM | ${dateRange}`,
            filename: 'outreach-performance',
            sections: [
              { title: 'Profit Progress', rows: [
                { Metric: 'Gross Profit Achieved', Value: `$${profitDone.toLocaleString()}` },
                { Metric: 'Profit Target', Value: profitTarget > 0 ? `$${profitTarget.toLocaleString()}` : 'Not configured' },
                { Metric: 'Completion', Value: `${safePct(profitDone, profitTarget)}%` },
                { Metric: 'Projected (run rate)', Value: `$${projectedProfit.toLocaleString()}` },
              ]},
              { title: 'Outreach vs Target (This Month)', rows: [
                { Channel: 'Emails', Completed: emailDone, Target: emailTarget || '—', Completion: `${safePct(emailDone, emailTarget)}%`, Replies: outreach.email_replies || 0 },
                { Channel: 'Calls', Completed: callsDone, Target: callsPref || '—', Completion: `${safePct(callsDone, callsPref)}%`, Replies: outreach.calls_answered || 0 },
                { Channel: 'Texts', Completed: textsDone, Target: textsTarget || '—', Completion: `${safePct(textsDone, textsTarget)}%`, Replies: outreach.text_replies || 0 },
              ]},
              { title: 'Contact Eligibility', rows: [
                { Metric: 'Eligible Contacts', Value: eligibleContacts },
                { Metric: 'Excluded (Removed)', Value: excludedContacts },
              ]},
            ],
          })}><Ic n={I.export} size={13} /> Export PDF</Btn>
        </div>
      </div>
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Monthly profit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="kpi-featured" style={{ background: 'linear-gradient(145deg,#059669,#10B981)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>{prefix} Gross Profit</span>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 5 }}>${profitDone.toLocaleString()}</div>
              <Trend val="0" white />
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Target: ${profitTarget.toLocaleString()} · {safePct(profitDone, profitTarget)}%</div>
              <div style={{ marginTop: 10, height: 5, background: 'rgba(255,255,255,0.25)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, safePct(profitDone, profitTarget))}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 99 }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>Remaining: ${(profitTarget-profitDone > 0 ? profitTarget-profitDone : 0).toLocaleString()}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">{mine('Projected period-end')}</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--green)' }}>${projectedProfit.toLocaleString()}</div>
            <div className="kpi-sub">Based on current pace</div>
            <span className={`badge ${projectedPct >= 100 ? 'b-green' : 'b-amber'}`} style={{ marginTop: 8 }}>{projectedPct}% of target</span>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Units Sold — {prefix.replace('ly', '')}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{m.total_units || 0}</div>
            <Trend val="0"/><div className="kpi-sub">vs previous {dateRange.replace('This ', '')}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">{mine('Eligible contacts')}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{eligibleContacts}</div>
            <div className="kpi-sub">For email, call, or text</div>
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{excludedContacts} excluded (Removed)</div>
          </div>
        </div>

        {/* Daily targets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            {
              label: 'Email Target', icon: I.mail, color: '#315EF6', done: emailDone, target: emailTarget,
              details: [
                { k: 'Remaining', v: remaining(emailDone, emailTarget), color: 'var(--amber)' },
                { k: 'Completion', v: pctLabel(emailDone, emailTarget), color: 'var(--brand)' },
                { k: 'Valid Available', v: eligibleContacts, color: 'var(--green)' },
                { k: 'Excluded', v: excludedContacts, color: 'var(--red)' },
              ],
              ...targetStatus(emailDone, emailTarget, 'Completed', 'On Track'),
              statusCls: 'b-blue',
            },
            {
              label: 'Call Target', icon: I.phone, color: '#0D9488', done: callsDone, target: callsPref,
              details: [
                { k: 'Answered', v: outreach.calls_answered || 0, color: 'var(--green)' },
                { k: 'No Answer', v: outreach.calls_unanswered || 0, color: 'var(--amber)' },
                { k: 'Remaining', v: remaining(callsDone, callsPref), color: 'var(--brand)' },
                { k: 'Completion', v: pctLabel(callsDone, callsPref), color: 'var(--green)' },
              ],
              // 'Min Achieved' never checked a minimum -- it was the fallback for
              // anything under 100%, so it showed even at zero calls. Compared
              // against the configured minimum now, with preferred as the target.
              ...(noTarget(callsPref)
                ? { badgeLabel: 'No target set', badgeCls: 'b-gray' }
                : safePct(callsDone, callsPref) >= 100 ? { badgeLabel: 'Target Achieved', badgeCls: null }
                : callsMin > 0 && callsDone >= callsMin ? { badgeLabel: 'Min Achieved', badgeCls: null }
                : { badgeLabel: 'Below Target', badgeCls: 'b-amber' }),
              statusCls: 'b-green',
            },
            {
              label: 'Text / SMS Target', icon: I.inquiry, color: '#7C3AED', done: textsDone, target: textsTarget,
              details: [
                { k: 'Remaining', v: remaining(textsDone, textsTarget), color: 'var(--amber)' },
                { k: 'Replies', v: outreach.text_replies || 0, color: 'var(--green)' },
                { k: 'Completion', v: pctLabel(textsDone, textsTarget), color: 'var(--brand)' },
                { k: 'Valid Available', v: eligibleContacts, color: 'var(--purple)' },
              ],
              ...targetStatus(textsDone, textsTarget, 'Completed', 'On Track'),
              statusCls: 'b-teal',
            },
          ].map(t => (
            <div key={t.label} className="chart-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: `${t.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic n={t.icon} size={15} style={{ color: t.color }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t.label}</span>
                </div>
                <span className={`badge ${t.badgeCls ?? t.statusCls}`}>{t.badgeLabel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                {/* The big number is the month-to-date count, not the target the
                    card is named after -- it read as "the target is 1500". */}
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{t.done}</span>
                <span style={{ fontSize: 13, color: 'var(--t4)' }}>
                  {noTarget(t.target) ? 'logged this month' : `of ${t.target.toLocaleString()} this month`}
                </span>
              </div>
              <Prog pct={noTarget(t.target) ? 0 : (t.done / t.target) * 100} color={t.color} tall />
              {noTarget(t.target) && (
                <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 6 }}>
                  No target configured — set one in Configuration → Daily Targets.
                </div>
              )}
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {t.details.map(d => (
                  <div key={d.k} style={{ background: 'var(--s2)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--t4)', marginBottom: 2 }}>{d.k}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: d.color, fontFamily: 'var(--mono)' }}>{d.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Combined summary table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-s)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Combined Outreach Summary — {dateRange}</span>
          </div>
          <table className="crm">
            <thead><tr><th>Channel</th><th>Target</th><th className="r">Completed</th><th className="r">Remaining</th><th>Progress</th><th>Status</th></tr></thead>
            <tbody>
              {[
                // Same unset-target problem as the cards above: 'Nearly Complete'
                // was the fallback for anything under 100%, so it showed at zero.
                { ch: 'Email', target: noTarget(emailTarget) ? 'Not set' : emailTarget.toLocaleString(), done: emailDone, rem: remaining(emailDone, emailTarget), pct: safePct(emailDone, emailTarget), ...targetStatus(emailDone, emailTarget, 'Completed', 'In Progress'), cls2: 'b-blue' },
                { ch: 'Calls', target: noTarget(callsPref) ? 'Not set' : `${callsPref.toLocaleString()} pref`, done: callsDone, rem: remaining(callsDone, callsPref), pct: safePct(callsDone, callsPref), ...(noTarget(callsPref) ? { badgeLabel: 'No target set', badgeCls: 'b-gray' } : safePct(callsDone, callsPref) >= 100 ? { badgeLabel: 'Completed', badgeCls: null } : callsMin > 0 && callsDone >= callsMin ? { badgeLabel: 'Min Achieved', badgeCls: null } : { badgeLabel: 'Below Target', badgeCls: 'b-amber' }), cls2: 'b-green' },
                { ch: 'Texts (SMS)', target: noTarget(textsTarget) ? 'Not set' : textsTarget.toLocaleString(), done: textsDone, rem: remaining(textsDone, textsTarget), pct: safePct(textsDone, textsTarget), ...targetStatus(textsDone, textsTarget, 'Completed', 'In Progress'), cls2: 'b-teal' },
              ].map(r => (
                <tr key={r.ch}>
                  <td style={{ fontWeight: 600 }}>{r.ch}</td>
                  <td className="mono">{r.target}</td>
                  <td className="r mono bold">{r.done}</td>
                  <td className="r mono" style={{ color: 'var(--amber)' }}>{r.rem}</td>
                  <td style={{ minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}><Prog pct={r.pct} /></div>
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{r.badgeLabel === 'No target set' ? '—' : `${r.pct}%`}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${r.badgeCls ?? r.cls2}`}>{r.badgeLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}


export default OutreachDashboard
