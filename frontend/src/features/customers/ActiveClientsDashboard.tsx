import React, { useState } from 'react'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import { NewInquiryDialog, NewManualSaleDialog, type WarmLeadOption } from '../pipeline/PipelineDialogs'
import { useCustomers } from '../../hooks/useCustomers'
import { useWarmLeads } from '../../hooks/useWarmLeads'

const ActiveClientsDashboard = ({ role, onNav }: { role?: string; onNav?: (s: Screen) => void }) => {
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [viewRow, setViewRow] = useState<any>(null)
  const [inquiryIdentity, setInquiryIdentity] = useState<string | null>(null)
  const [saleInitialData, setSaleInitialData] = useState<any | null>(null)
  const [showManualSale, setShowManualSale] = useState(false)
  const [showNewInquiry, setShowNewInquiry] = useState(false)

  // Scoped to personal active clients for sales managers
  const customers = useCustomers(tab, search, revision, undefined, 'personal')
  // NewInquiryDialog requires the warm-lead options, same as every other caller.
  const warmLeads = useWarmLeads(revision)

  // Derive portfolio KPIs
  const activeCount = customers.filter(c => c.status === 'Active').length
  const floatingCount = customers.filter(c => c.status === 'Floating').length
  const totalUnits = customers.reduce((sum, c) => sum + (c.units || 0), 0)
  const totalRevenue = customers.reduce((sum, c) => sum + (c.revenue || 0), 0)
  const totalGrossProfit = customers.reduce((sum, c) => sum + (c.profit || 0), 0)
  const avgMargin = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : '0.0'

  const filtered = tab === 'All' ? customers : customers.filter(c => c.status === tab)

  const handleFastInquiry = (c: any) => {
    const ident = c.phone !== '-' ? c.phone : (c.email !== '-' ? c.email : c.co)
    setInquiryIdentity(ident)
  }

  const handleFastSale = (c: any) => {
    setSaleInitialData({
      companyName: c.co,
      contactPerson: c.contact !== '-' ? c.contact : '',
      phone: c.phone !== '-' ? c.phone : '',
      email: c.email !== '-' ? c.email : '',
      stateProvince: c.state !== '-' ? c.state : '',
      country: c.country !== '-' ? c.country : '',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Active Clients Dashboard</div>
          <div className="page-desc">Your dedicated client portfolio. Manage repeat buyers, monitor lifetime value, and trigger quick deals.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={() => setShowNewInquiry(true)}><Ic n={I.inquiry} size={13} /> New Inquiry</Btn>
          <Btn variant="primary" sm onClick={() => setShowManualSale(true)}><Ic n={I.plus} size={13} /> Record Sale</Btn>
        </div>
        {showNewInquiry && (
          <NewInquiryDialog
            warmLeads={warmLeads as WarmLeadOption[]}
            onClose={() => setShowNewInquiry(false)}
            onSaved={() => { setShowNewInquiry(false); setRevision(r => r + 1) }}
          />
        )}
        {showManualSale && (
          <NewManualSaleDialog
            onClose={() => setShowManualSale(false)}
            onSaved={() => { setShowManualSale(false); setRevision(r => r + 1) }}
          />
        )}
        {inquiryIdentity && (
          <NewInquiryDialog
            warmLeads={warmLeads as WarmLeadOption[]}
            initialIdentity={inquiryIdentity}
            onClose={() => setInquiryIdentity(null)}
            onSaved={() => { setInquiryIdentity(null); setRevision(r => r + 1) }}
          />
        )}
        {saleInitialData && (
          <NewManualSaleDialog
            initialData={saleInitialData}
            onClose={() => setSaleInitialData(null)}
            onSaved={() => { setSaleInitialData(null); setRevision(r => r + 1) }}
          />
        )}
      </div>

      {/* Sales Portfolio KPI Strip */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { label: 'Active Accounts', val: activeCount.toString(), color: 'var(--green)' },
          { label: 'Floating Accounts', val: floatingCount.toString(), color: '#F59E0B' },
          { label: 'Total Units Sold', val: totalUnits.toLocaleString(), color: '#7C3AED' },
          { label: 'Portfolio Revenue', val: `$${totalRevenue.toLocaleString()}`, color: 'var(--brand)' },
          { label: 'Gross Profit (Margin)', val: `$${totalGrossProfit.toLocaleString()} (${avgMargin}%)`, color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} style={{ textAlign: 'center', padding: '8px 0', borderRight: '1px solid var(--border-s)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        {['All', 'Active', 'Floating'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field">
          <Ic n={I.search} size={13} />
          <input placeholder="Search active clients by name, contact, phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <span className="count-label">{filtered.length} clients</span>
          <ExportMenu data={filtered} filename="active-clients" />
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>State</th>
              <th className="r">Sales</th>
              <th className="r">Units</th>
              <th className="r">Revenue</th>
              <th className="r">Gross Profit</th>
              <th>Last Purchase</th>
              <th>Status</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--t3)' }}>
                  No active clients found matching current filter.
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{c.co}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>
                      {c.phone !== '-' ? c.phone : (c.email !== '-' ? c.email : '')}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{c.contact}</td>
                  <td>
                    <span className="badge b-gray" style={{ fontFamily: 'var(--mono)' }}>{c.state}</span>
                  </td>
                  <td className="r mono bold">{c.sales}</td>
                  <td className="r mono bold">{c.units}</td>
                  <td className="r revenue-cell">${c.revenue.toLocaleString()}</td>
                  <td className="r profit-cell">${c.profit.toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{c.last}</td>
                  <td><Badge status={c.status as BadgeStatus} /></td>
                  <td className="col-actions">
                    <div className="row-actions" style={{ display: 'flex', gap: 4 }}>
                      <Btn variant="secondary" sm onClick={() => handleFastInquiry(c)} title="Fast 1-Click Inquiry"><Ic n={I.inquiry} size={12} /> Inquiry</Btn>
                      <Btn variant="ghost" sm onClick={() => handleFastSale(c)} title="Fast Direct Sale"><Ic n={I.plus} size={12} /> Sale</Btn>
                      <Btn variant="ghost" sm onClick={() => setViewRow(c)}>View</Btn>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewRow && (
        <RecordDetailModal
          title={viewRow.co}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Contact', value: viewRow.contact },
            { label: 'Phone', value: viewRow.phone },
            { label: 'Email', value: viewRow.email },
            { label: 'State', value: viewRow.state },
            { label: 'Country', value: viewRow.country },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Sales Count', value: viewRow.sales },
            { label: 'Total Units', value: viewRow.units },
            { label: 'Revenue', value: `$${viewRow.revenue.toLocaleString()}` },
            { label: 'Gross Profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Last Purchase', value: viewRow.last },
          ]}
        />
      )}
    </div>
  )
}

// ─── Customer Accounts (Operations Master) ───────────────────────────────────

export default ActiveClientsDashboard
