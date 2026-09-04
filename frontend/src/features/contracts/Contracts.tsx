import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge, ChipPIC } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import { NewContractDialog } from '../pipeline/PipelineDialogs'
import { useContracts } from '../../hooks/useContracts'
import { useSales } from '../../hooks/useSales'

const Contracts = () => {
  const [status, setStatus] = useState('All Statuses');
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [revision, setRevision] = useState(0);
  const [viewRow, setViewRow] = useState<any>(null);
  const contracts = useContracts(status, pickStatus, search, revision);
  // Re-fetch sales when clicking New Contract
  const sales = useSales(revision);
  const overdueContracts = contracts.filter(c => c.pickStatus === 'Overdue');
  const contractTransitions = (contract: any) => {
    if (contract.status === 'Pending Signature') return ['Active', 'Cancelled'];
    if (contract.status === 'Active') return contract.storedPickStatus === 'Picked Up' ? ['Completed'] : ['Cancelled'];
    return [];
  };
  const updateContractStatus = async (id: string, nextStatus: string) => {
    try {
      await api.patch(`/contracts/${id}`, { status: nextStatus });
      toast(`Contract marked ${nextStatus}`, 'success');
      setRevision(value => value + 1);
    } catch (error: any) {
      toast(error.response?.data?.error?.message ?? 'Contract status could not be updated', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {overdueContracts.length > 0 && (
        <div style={{ padding: '10px 20px', background: 'var(--red-bg)', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ic n={I.warning} size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red-text)' }}>
            {overdueContracts.length === 1
              ? `1 pickup is overdue — ${overdueContracts[0].co} · ${overdueContracts[0].ref}`
              : `${overdueContracts.length} pickups are overdue`}
          </span>
        </div>
      )}
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contracts…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={status} onChange={e => setStatus(e.target.value)}><option>All Statuses</option><option>Pending Signature</option><option>Active</option><option>Completed</option><option>Cancelled</option></select>
        <select className="sel" value={pickStatus} onChange={e => setPickStatus(e.target.value)}><option>All Pickup Statuses</option><option>Pending</option><option>Scheduled</option><option>Confirmed</option><option>Picked Up</option><option>Overdue</option></select>
        <div className="toolbar-right">
          <Btn variant="primary" sm onClick={() => setShowNew(true)}><Ic n={I.plus} size={13} /> New Contract</Btn>
          {showNew && <NewContractDialog sales={sales} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); setRevision(r => r + 1); }} />}
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Contract #</th><th>Company</th><th>Container</th><th className="r">Qty</th>
            <th className="r">Value</th><th>Pickup Date</th><th>Pickup Status</th>
            <th>Status</th><th>PIC</th><th>Source Sale</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id} style={{ background: c.pickStatus === 'Overdue' ? 'var(--red-bg)' : undefined }}>
                <td><span className="ref-id" style={{ color: 'var(--teal)' }}>{c.ref}</span></td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{c.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{c.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{c.category} · {c.size}</td>
                <td className="r mono bold">{c.qty}</td>
                <td className="r revenue-cell">${c.value.toLocaleString()}</td>
                <td className="mono" style={{ fontSize: 12 }}>{c.pickup}</td>
                <td><Badge status={c.pickStatus as BadgeStatus} /></td>
                <td><Badge status={c.status as BadgeStatus} /></td>
                <td><ChipPIC label={c.pic} /></td>
                <td><span className="ref-id" style={{ color: 'var(--green)', fontSize: 11 }}>{c.sale}</span></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(c)}>View</Btn>
                    {contractTransitions(c).length > 0 && <select className="sel" value="" aria-label={`Update ${c.ref} status`} onChange={e => { if (e.target.value) updateContractStatus(c.id, e.target.value) }} style={{ padding: '4px 8px', fontSize: 11, minWidth: 110 }}><option value="">Change status…</option>{contractTransitions(c).map(next => <option key={next}>{next}</option>)}</select>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Contract ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.co },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Pickup status', value: <Badge status={viewRow.pickStatus as BadgeStatus} /> },
            { label: 'Container', value: `${viewRow.category} · ${viewRow.size}` },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Reserved inventory', value: viewRow.inventory },
            { label: 'Value', value: `$${viewRow.value.toLocaleString()}` },
            { label: 'Pickup date', value: viewRow.pickup },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Source sale', value: viewRow.sale },
          ]}
        />
      )}
    </div>
  )
}


export default Contracts
