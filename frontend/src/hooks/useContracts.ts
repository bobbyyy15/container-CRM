import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useContracts = (status = 'All Statuses', pickStatus = 'All Pickup Statuses', search = '', revision = 0) => {
  const [data, setData] = useState<any[]>([]);
  const liveRevision = useRealtimeRevision(['contracts', 'deals']);
  useEffect(() => {
    api.get('/contracts', { params: { status, pickStatus, search } }).then(res => {
      setData((res.data.data || []).map((c: any) => ({
        id: c.id,
        ref: c.contract_number,
        co: c.company_name,
        contact: c.primary_contact ? c.primary_contact.first_name + ' ' + (c.primary_contact.last_name || '') : '-',
        category: c.items && c.items.length > 0 ? c.items[0].description.split(' ')[0] : '-',
        size: c.items && c.items.length > 0 ? c.items[0].description : '-',
        qty: c.allocated_quantity ?? c.total_units,
        value: Number(c.revenue),
        pickup: c.pickup_date ? new Date(c.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unscheduled',
        pickupDateRaw: c.pickup_date ? String(c.pickup_date).slice(0, 10) : '',
        pickStatus: c.pickup_status,
        storedPickStatus: c.stored_pickup_status || c.pickup_status,
        status: c.contract_status,
        pic: c.pic_name || '-',
        sale: c.sale_number,
        inventory: c.inventory_label || 'Legacy contract — no stock allocation',
      })));
    }).catch(console.error);
  }, [status, pickStatus, search, revision, liveRevision]);
  return data;
}

