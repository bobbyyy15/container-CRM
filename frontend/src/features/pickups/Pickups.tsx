import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useContracts } from '../../hooks/useContracts'
import EmptyTableState from '../../components/ui/EmptyTableState'
import { TableSkeleton } from '../../components/ui/SkeletonLoader'
import RefreshButton from '../../components/ui/RefreshButton'
import { confirmDelete } from '../../lib/deleteRecord'

const Pickups = ({ role }: { role?: string }) => {
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [pickupDates, setPickupDates] = useState<Record<string, string>>({});
  const contracts = useContracts('All Statuses', pickStatus, search, revision);

  const canDelete = role === 'admin' || role === 'sales_manager';

  // A pickup row is a contract -- there is no separate pickup record -- so this
  // deletes the contract and releases its reserved stock, same as the Customer
  // Contracts screen. Worth spelling out, since the row is not labelled that way.
  const handleDelete = (c: any) => confirmDelete({
    what: 'Contract',
    name: c.ref,
    endpoint: `/contracts/${c.id}`,
    cacheKey: 'contracts',
    detail: `This pickup is contract ${c.ref}; deleting it removes the contract and releases its ${c.qty} reserved unit${c.qty === 1 ? '' : 's'} back into stock.`,
    onDeleted: () => setRevision(r => r + 1),
  });

  const handleUpdateStatus = async (contract: any, newStatus: string) => {
    try {
      const date = pickupDates[contract.id] ?? contract.pickupDateRaw;
      await api.patch(`/contracts/${contract.id}`, {
        pickup_status: newStatus,
        ...(date ? { pickup_date: new Date(`${date}T12:00:00`).toISOString() } : {}),
      });
      setRevision(r => r + 1);
      toast(`Pickup marked ${newStatus}`, 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update status', 'error');
    }
  };

  const pickupTransitions: Record<string, string[]> = {
    Pending: ['Scheduled'],
    Scheduled: ['Pending', 'Confirmed'],
    Confirmed: ['Scheduled', 'Picked Up'],
  };
  const savePickupDate = async (contract: any) => {
    const date = pickupDates[contract.id];
    if (!date) return;
    try {
      await api.patch(`/contracts/${contract.id}`, { pickup_date: new Date(`${date}T12:00:00`).toISOString() });
      toast('Pickup date saved', 'success');
      setRevision(value => value + 1);
    } catch (error: any) {
      toast(error.response?.data?.error?.message ?? 'Pickup date could not be saved', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Pickup Tracking</div>
          <div className="page-desc">Manage container dispatch and warehouse fulfillment.</div>
        </div>
      </div>
      
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search pickups…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={pickStatus} onChange={e => setPickStatus(e.target.value)}>
          <option>All Pickup Statuses</option>
          <option>Pending</option>
          <option>Scheduled</option>
          <option>Confirmed</option>
          <option>Picked Up</option>
          <option>Overdue</option>
        </select>
        <div className="toolbar-right">
          <RefreshButton cacheKey="contracts" label="Pickups" onRefresh={() => setRevision(r => r + 1)} />
          <span className="count-label">{contracts.length} pickups</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Contract #</th><th>Company</th><th>Container</th><th className="r">Qty</th>
            <th>Target Date</th><th>Status</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          {contracts.loading && contracts.length === 0 ? (
            <TableSkeleton rows={8} cols={8} asTable={true} />
          ) : (
            <tbody>
              {contracts.length === 0 && (
                <EmptyTableState
                  colSpan={8}
                  icon={I.pickup}
                  title="No pickups found"
                  subtitle={search || pickStatus !== 'All Pickup Statuses'
                    ? 'No pickups match your filters. Try clearing the search or dropdown.'
                    : 'Pickups appear here once contracts are raised against Won sales.'}
                />
              )}
            {contracts.map(c => (
              <tr key={c.id} style={{ background: c.pickStatus === 'Overdue' ? 'var(--red-bg)' : undefined }}>
                <td><span className="ref-id" style={{ color: 'var(--teal)' }}>{c.ref}</span></td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{c.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{c.contact}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{c.size}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.category}</div>
                </td>
                <td className="r" style={{ fontWeight: 600 }}>{c.qty}</td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="date" className="inp" aria-label={`Pickup date for ${c.ref}`} value={pickupDates[c.id] ?? c.pickupDateRaw} onChange={e => setPickupDates(values => ({ ...values, [c.id]: e.target.value }))} disabled={c.storedPickStatus === 'Picked Up'} style={{ minWidth: 132, padding: '5px 7px', fontSize: 11 }} />{pickupDates[c.id] && pickupDates[c.id] !== c.pickupDateRaw && <Btn variant="ghost" sm onClick={() => savePickupDate(c)}>Save</Btn>}</div></td>
                <td>
                  <span className={`badge ${c.pickStatus === 'Picked Up' ? 'b-green' : c.pickStatus === 'Overdue' ? 'b-red' : c.pickStatus === 'Confirmed' ? 'b-brand' : 'b-amber'}`}>
                    {c.pickStatus}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--t2)' }}>{c.pic}</td>
                <td className="col-actions">
                  <select 
                    className="sel" 
                    value=""
                    aria-label={`Update ${c.ref} pickup status`}
                    onChange={e => { if (e.target.value) handleUpdateStatus(c, e.target.value) }}
                    disabled={(pickupTransitions[c.storedPickStatus] || []).length === 0}
                    style={{ padding: '4px 8px', fontSize: 11, minWidth: 110 }}
                  >
                    <option value="">Next step…</option>
                    {(pickupTransitions[c.storedPickStatus] || []).map(next => <option key={next} value={next}>{next}</option>)}
                  </select>
                  {canDelete && c.storedPickStatus !== 'Picked Up' && c.status !== 'Completed' && (
                    <Btn variant="danger" sm onClick={() => handleDelete(c)} title="Permanently delete the underlying contract">
                      <Ic n={I.removed} size={12} /> Delete
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          )}
        </table>
      </div>
    </div>
  );
};

export default Pickups
