import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useCustomers = (status = 'All', search = '', revision = 0, limit?: number) => {
  const [data, setData] = useState<any[]>([]);
  const liveRevision = useRealtimeRevision(['deals', 'contracts']);
  useEffect(() => {
    api.get('/customers', { params: { status, search, ...(limit ? { limit } : {}) } }).then(res => {
      setData((res.data.data || []).map((c: any) => ({
        id: c.company_id,
        co: c.company_name,
        contact: c.primary_contact ? c.primary_contact.first_name + ' ' + (c.primary_contact.last_name || '') : '-',
        phone: c.primary_contact ? (c.primary_contact.phone_1 || c.primary_contact.phone_2) : '-',
        state: c.state || '-',
        country: c.country || '-',
        sales: c.sales_count,
        units: c.total_units,
        revenue: Number(c.total_revenue),
        profit: Number(c.total_gross_profit),
        last: new Date(c.last_purchase_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pic: c.pic_name || '-',
        status: c.status
      })));
    }).catch(console.error);
  }, [status, search, revision, liveRevision, limit]);
  return data;
}
