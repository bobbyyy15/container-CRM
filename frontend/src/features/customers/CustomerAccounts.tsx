import React, { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import { NewManualSaleDialog } from '../pipeline/PipelineDialogs'
import { useCustomers } from '../../hooks/useCustomers'

const CustomerAccounts = () => {
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [revision, setRevision] = useState(0);
  const [viewRow, setViewRow] = useState<any>(null);
  const customers = useCustomers(tab, search, revision);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Accounts</div>
          <div className="page-desc">Companies with confirmed purchase history.</div>
        </div>
        {/* Customers are derived from purchase history (see page-desc above), so
            there's no standalone "customer" record to create -- this records a sale,
            which is what actually makes a company show up on this list. */}
        <Btn variant="primary" sm onClick={() => setShowNewCustomer(true)} title="Customers are created by recording a sale"><Ic n={I.plus} size={13} /> Record Sale → New Customer</Btn>
        {showNewCustomer && <NewManualSaleDialog onClose={() => setShowNewCustomer(false)} onSaved={() => { setShowNewCustomer(false); setRevision(r => r + 1); }} />}
      </div>
      <div className="tabs">
        {['All', 'Active', 'Floating'].map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="toolbar-right">
          <span className="count-label">{customers.length} customers</span>
          <ExportMenu data={customers} filename="customers" />
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Company</th><th>Contact</th><th>State</th><th>PIC</th>
            <th className="r">Sales</th><th className="r">Units</th><th className="r">Revenue</th>
            <th className="r">Gross Profit</th><th>Last Purchase</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {(tab === 'All' ? customers : customers.filter(c => c.status === tab)).map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{c.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{c.phone}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{c.contact}</td>
                <td><span className="badge b-gray" style={{ fontFamily: 'var(--mono)' }}>{c.state}</span></td>
                <td><ChipPIC label={c.pic} /></td>
                <td className="r mono bold">{c.sales}</td>
                <td className="r mono bold">{c.units}</td>
                <td className="r revenue-cell">${c.revenue.toLocaleString()}</td>
                <td className="r profit-cell">${c.profit.toLocaleString()}</td>
                <td style={{ fontSize: 12, color: 'var(--t3)' }}>{c.last}</td>
                <td><Badge status={c.status as BadgeStatus} /></td>
                <td className="col-actions">
                  <div className="row-actions"><Btn variant="ghost" sm onClick={() => setViewRow(c)}>View</Btn></div>
                </td>
              </tr>
            ))}
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
            { label: 'State', value: viewRow.state },
            { label: 'Country', value: viewRow.country },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Sales', value: viewRow.sales },
            { label: 'Units', value: viewRow.units },
            { label: 'Revenue', value: `$${viewRow.revenue.toLocaleString()}` },
            { label: 'Gross profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Last purchase', value: viewRow.last },
          ]}
        />
      )}
    </div>
  )
}


export default CustomerAccounts
