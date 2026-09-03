import { useState, useCallback, useEffect } from 'react'
import { supabase } from './config/supabase'
import { api } from './lib/api'
import { toast, askConfirm, askReason, ToastHost, ConfirmHost } from './lib/notify'
import Login from './Login'
import ProspectImportDialog from './features/import/ProspectImportDialog'
import { UserProfileSettings } from './features/settings/UserProfileSettings'
import { UserManagement } from './features/settings/UserManagement'
import ResetPassword from './features/settings/ResetPassword'
import {
  NewInquiryDialog,
  NewWarmLeadDialog,
  NewProspectDialog,
  NewManualSaleDialog,
  NewContractDialog,
  QuotationDialog,
  SaleDialog,
  usePics,
  type InquiryOption,
  type QuotationOption,
  type WarmLeadOption,
} from './features/pipeline/PipelineDialogs'

import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts'

// xlsx is ~490KB, so it's loaded on demand rather than bundled into the initial
// payload -- same pattern the Excel importers already use.
const exportToExcel = async (data: any[], filename: string) => {
  if (!data || !data.length) return toast('There is nothing to export.', 'error')
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Export')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  } catch {
    toast('Could not build the Excel file.', 'error')
  }
}

const exportToGoogleSheet = async (data: any[], filename: string) => {
  if (!data || !data.length) return toast('There is nothing to export.', 'error')
  toast('Creating your Google Sheet…', 'info')
  try {
    const res = await api.post('/export/google-sheet', { title: filename, rows: data })
    const url = res.data.data?.url
    if (url) {
      window.open(url, '_blank', 'noopener')
      toast(`Sheet created with ${res.data.data.rowCount} rows.`, 'success')
    }
  } catch (e: any) {
    toast(e.response?.data?.error?.message ?? 'Google Sheets export failed.', 'error')
  }
}

const ExportMenu = ({ data, filename, sm = true }: { data: any[]; filename: string; sm?: boolean }) => {
  const [open, setOpen] = useState(false)
  const options = [
    { label: 'CSV file',      icon: I.export, run: () => exportToCSV(data, filename) },
    { label: 'Excel (.xlsx)', icon: I.export, run: () => exportToExcel(data, filename) },
    { label: 'Google Sheet',  icon: I.link,   run: () => exportToGoogleSheet(data, filename) },
  ]
  return (
    <div style={{ position: 'relative' }}>
      <Btn variant="ghost" sm={sm} onClick={() => setOpen(o => !o)}>
        <Ic n={I.export} size={13} /> Export <Ic n={I.chevDown} size={11} />
      </Btn>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 170, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
            {options.map(o => (
              <div
                key={o.label}
                onClick={() => { setOpen(false); o.run() }}
                style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--t2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Ic n={o.icon} size={13} style={{ color: 'var(--t4)' }} />
                {o.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const exportToCSV = (data: any[], filename: string) => {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + (val || '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const mapPipelineRow = (p: any) => ({
  id: p.id,
  added: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  pic: p.pics?.name || 'Unassigned',
  cat: p.category || (p.status === 'active' ? 'Proceed' : p.status) || 'Proceed',
  sms: p.source_data?.sms_deliverability || 'Call/Text',
  email: p.source_data?.email_deliverability || (p.contacts?.email_active ? 'Available' : 'Unavailable'),
  industry: p.companies?.industry || '',
  territory: p.source_data?.service_locations || '',
  country: p.companies?.address_country || '',
  state: p.companies?.address_state || '',
  city: p.companies?.address_city || '',
  company: p.companies?.name || '',
  contact: p.contacts ? `${p.contacts.first_name || ''} ${p.contacts.last_name || ''}`.trim() : '',
  contactMissing: !p.contact_id,
  phone: p.contacts?.phone_direct || '',
  phone2: p.contacts?.phone_2 || '',
  emailAddr: p.contacts?.email_active || '',
  email2: p.contacts?.email_2 || '',
  address: p.companies?.address_street || '',
  lifecycleStatus: p.lifecycle_status || 'active',
  conversionReason: p.conversion_reason || '',
  conversionChannel: p.conversion_channel || '',
})

export const useWarmLeads = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/leads/warm-leads', { params: { limit: 500 } }).then(res => {
      if (res.data.success) setData((res.data.data || []).map(mapPipelineRow))
    }).catch(console.error)
  }, [revision])
  return data
}

const useInquiries = (revision = 0, status: 'active' | 'all' = 'active') => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/leads/inquiries', { params: { limit: 500, status } }).then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
        const created = new Date(row.created_at)
        return {
          id: row.id,
          companyId: row.company_id,
          contactId: row.contact_id,
          ref: `INQ-${row.id.slice(0, 8).toUpperCase()}`,
          date: created.toLocaleDateString(),
          time: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          channel: row.requirements?.match(/email/i) ? 'Email' : 'Direct',
          company: row.companies?.name || '',
          contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
          // Carried so the Quick Contact Lookup bar can actually match on phone/email,
          // which is what its placeholder promises.
          phone: row.contacts?.phone_direct || row.contacts?.phone_2 || '',
          email: row.contacts?.email_active || row.contacts?.email_2 || '',
          category: row.requirements || 'To be qualified',
          size: row.container_sizes?.name || '—',
          condition: row.container_conditions?.name || '—',
          qty: row.quantity ?? '—',
          neededBy: row.needed_by_date ? new Date(row.needed_by_date).toLocaleDateString() : '—',
          status: row.status || 'Under Review',
          pic: row.pics?.name || 'Unassigned',
          rejectionReason: row.rejection_reason || '',
          altSize: row.alt_size?.name || '',
          altCondition: row.alt_condition?.name || '',
          altQuantity: row.alt_quantity ?? null,
          altAskingPrice: row.alt_asking_price != null ? Number(row.alt_asking_price) : null,
          altNotes: row.alt_notes || '',
          hasAlternative: !!(row.alt_size || row.alt_condition || row.alt_quantity != null || row.alt_asking_price != null),
        }
      }))
    }).catch(console.error)
  }, [revision, status])
  return data
}

const useQuotations = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/deals/quotations').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
        const items = row.quotation_items || []
        const quantity = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
        const total = Number(row.total_amount || 0)
        return {
          id: row.id,
          inquiryId: row.inquiry_id,
          ref: `QUO-${row.id.slice(0, 8).toUpperCase()}`,
          date: new Date(row.created_at).toLocaleDateString(),
          co: row.companies?.name || '',
          contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
          category: items[0]?.description || 'Container',
          size: '—',
          qty: quantity,
          sellTotal: total,
          profit: 0,
          margin: 0,
          status: row.status,
          source: row.inquiry_id ? `INQ-${row.inquiry_id.slice(0, 8).toUpperCase()}` : 'Direct',
          pic: row.pics?.name || 'Unassigned',
        }
      }))
    }).catch(console.error)
  }, [revision])
  return data
}

const useSales = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/deals/sales').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
        const units = Number(row.total_units || 0)
        const buyingCost = Number(row.buying_cost || 0)
        const revenue = Number(row.revenue || 0)
        const profit = Number(row.gross_profit || 0)
        const quote = row.quotations || {}
        const item = quote.quotation_items?.[0]
        return {
          id: row.id,
          ref: `SAL-${row.id.slice(0, 8).toUpperCase()}`,
          date: new Date(row.created_at).toLocaleDateString(),
          createdAt: row.created_at,
          company: row.companies?.name || '',
          contact: quote.contacts ? `${quote.contacts.first_name || ''} ${quote.contacts.last_name || ''}`.trim() : '',
          category: item?.description || 'Container',
          size: '—',
          condition: '—',
          qty: units,
          buyPU: units ? buyingCost / units : 0,
          sellPU: units ? revenue / units : 0,
          totalBuy: buyingCost,
          totalSell: revenue,
          profit,
          margin: revenue ? (profit / revenue) * 100 : 0,
          pic: row.pics?.name || 'Unassigned',
          status: row.status,
        }
      }))
    }).catch(console.error)
  }, [revision])
  return data
}

const useAnalytics = () => {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.get('/analytics/dashboard').then(res => {
      if (res.data.success) setData(res.data.data)
    }).catch(console.error)
  }, [])
  return data
}

const useNotifications = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const refresh = useCallback(() => {
    api.get('/notifications').then(res => {
      if (res.data.success) {
        setData(res.data.data || [])
        setUnread(res.data.meta?.unread ?? 0)
      }
    }).catch(console.error)
  }, [])
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh, revision])
  return { notifications: data, unread, refresh }
}



const useContracts = (status = 'All Statuses', pickStatus = 'All Pickup Statuses', search = '', revision = 0) => {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    api.get('/contracts', { params: { status, pickStatus, search } }).then(res => {
      setData((res.data.data || []).map((c: any) => ({
        id: c.id,
        ref: c.contract_number,
        co: c.company_name,
        contact: c.primary_contact ? c.primary_contact.first_name + ' ' + (c.primary_contact.last_name || '') : '-',
        category: c.items && c.items.length > 0 ? c.items[0].description.split(' ')[0] : '-',
        size: c.items && c.items.length > 0 ? c.items[0].description : '-',
        qty: c.total_units,
        value: Number(c.revenue),
        pickup: c.pickup_date ? new Date(c.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unscheduled',
        pickStatus: c.pickup_status,
        status: c.contract_status,
        pic: c.pic_name || '-',
        sale: c.sale_number
      })));
    }).catch(console.error);
  }, [status, pickStatus, search, revision]);
  return data;
}

const useCustomers = (status = 'All', search = '', revision = 0) => {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    api.get('/customers', { params: { status, search } }).then(res => {
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
  }, [status, search, revision]);
  return data;
}

const useProspects = (revision = 0, status: 'active' | 'converted' | 'removed' | 'all' = 'active') => {
  const [prospects, setProspects] = useState<any[]>([]);
  useEffect(() => {
    api.get('/leads/prospects', { params: { limit: 500, status } }).then(res => {
      const data = (res.data.data || []).map(mapPipelineRow);
      setProspects(data);
    }).catch(e => console.error("Failed to fetch API data", e));
  }, [revision, status]);
  return prospects;
}

const useInventory = (filters: Record<string, string> = {}, revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/inventory', { params: filters }).then(res => {
      if (res.data.success) setData(res.data.data || [])
    }).catch(console.error)
  }, [JSON.stringify(filters), revision])
  return data
}

const useInventorySummary = (revision = 0) => {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.get('/inventory/summary').then(res => {
      if (res.data.success) setData(res.data.data)
    }).catch(console.error)
  }, [revision])
  return data
}

// ─── Icon primitives ─────────────────────────────────────────────────────────

type IconProps = { size?: number; className?: string; style?: React.CSSProperties }

const Icon = ({ path, size = 16, className = '', style }: IconProps & { path: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
    strokeLinejoin="round" className={className} style={style}>
    <path d={path} />
  </svg>
)

const I = {
  dashboard:   'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 3a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
  prospect:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  lead:        'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  inquiry:     'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  quote:       'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-3 13H8m5-4H8m8-4H8M14 2v6h6',
  sales:       'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  customer:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  contract:    'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z',
  pickup:      'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  tasks:       'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  removed:     'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16',
  deliverabil: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.4 2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  container:   'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  analytics:   'M18 20V10M12 20V4M6 20v-6',
  config:      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  search:      'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  bell:        'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  moon:        'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun:         'M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 5a7 7 0 1 0 0 14A7 7 0 0 0 12 5z',
  sync:        'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  plus:        'M12 5v14M5 12h14',
  x:           'M18 6L6 18M6 6l12 12',
  chevDown:    'M6 9l6 6 6-6',
  chevRight:   'M9 18l6-6-6-6',
  chevLeft:    'M15 18l-6-6 6-6',
  arrowRight:  'M5 12h14M12 5l7 7-7 7',
  trending:    'M23 6l-9.5 9.5-5-5L1 18',
  trendDown:   'M23 18l-9.5-9.5-5 5L1 6',
  filter:      'M22 3H2l8 9.46V19l4 2v-8.54L22 3',
  export:      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  edit:        'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  more:        'M12 5h.01M12 12h.01M12 19h.01',
  mail:        'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm18 2l-8 7-8-7',
  phone:       'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.4 2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  check:       'M20 6L9 17l-5-5',
  warning:     'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  calendar:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  map:         'M3 11l19-9-9 19-2-8-8-2z',
  flag:        'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  target:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  upload:      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  menu:        'M3 12h18M3 6h18M3 18h18',
  sidebar:     'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm5 0v16',
  copy:        'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1',
  outreach:    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm18 2l-8 7-8-7',
  profit:      'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  link:        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen =
  | 'dashboard' | 'outreach-dashboard' | 'inquiry-dashboard'
  | 'prospects' | 'warm-leads' | 'inquiries' | 'quotations' | 'sales-tracker'
  | 'customers' | 'contact-outreach' | 'contracts' | 'pickups'
  | 'daily-tasks' | 'removed' | 'deliverability'
  | 'container-catalog'
  | 'pic-performance' | 'best-clients' | 'profit-analytics' | 'inquiry-funnel'
  | 'service-territories' | 'daily-targets' | 'system-settings' | 'profile-settings'
  | 'user-management' | 'inquiry-validation' | 'inventory-management' | 'monthly-report'

// ─── Navigation ──────────────────────────────────────────────────────────────

type NavItem = { id: Screen; label: string; icon: string; roles?: string[] }
type NavGroup = { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Executive Overview', icon: I.dashboard, roles: ['admin', 'sales_manager'] },
      { id: 'outreach-dashboard', label: 'Outreach Dashboard', icon: I.target, roles: ['admin', 'sales_manager'] },
      { id: 'inquiry-dashboard', label: 'Inquiry Dashboard', icon: I.inquiry, roles: ['admin', 'sales_manager', 'procurement'] },
    ],
  },
  {
    label: 'Sales Core',
    items: [
      { id: 'prospects', label: 'Prospect Clients', icon: I.prospect, roles: ['admin', 'sales_manager'] },
      { id: 'warm-leads', label: 'Warm Leads', icon: I.lead, roles: ['admin', 'sales_manager'] },
      { id: 'inquiries', label: 'Inquiries', icon: I.inquiry, roles: ['admin', 'sales_manager'] },
      { id: 'quotations', label: 'Quotations', icon: I.quote, roles: ['admin', 'sales_manager'] },
      { id: 'sales-tracker', label: 'Sales Tracker', icon: I.sales, roles: ['admin', 'sales_manager'] },
    ],
  },
  {
    label: 'Procurement Core',
    items: [
      { id: 'inquiry-validation', label: 'Inquiry Validation', icon: I.check, roles: ['admin', 'procurement'] },
    ],
  },
  {
    label: 'Operations Core',
    items: [
      { id: 'pickups', label: 'Pickup Tracking', icon: I.pickup, roles: ['admin', 'operations', 'sales_manager'] },
      { id: 'contracts', label: 'Customer Contracts', icon: I.contract, roles: ['admin', 'operations', 'sales_manager'] },
      { id: 'customers', label: 'Customer Accounts', icon: I.customer, roles: ['admin', 'operations', 'sales_manager'] },
    ],
  },
  {
    label: 'Catalog & Stock',
    items: [
      { id: 'inventory-management', label: 'Inventory Management', icon: I.upload, roles: ['admin', 'operations', 'procurement', 'sales_manager'] },
      { id: 'container-catalog', label: 'Container Catalog', icon: I.container, roles: ['admin', 'operations', 'procurement', 'sales_manager'] },
    ],
  },
  {
    label: 'Outreach & Data',
    items: [
      { id: 'contact-outreach', label: 'Contact Outreach', icon: I.outreach, roles: ['admin', 'sales_manager'] },
      { id: 'daily-tasks', label: 'Daily Tasks', icon: I.tasks, roles: ['admin', 'sales_manager'] },
      { id: 'removed', label: 'Removed Sheet', icon: I.removed, roles: ['admin', 'sales_manager'] },
      { id: 'deliverability', label: 'Deliverability', icon: I.deliverabil, roles: ['admin', 'sales_manager'] },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'pic-performance', label: 'PIC Performance', icon: I.analytics, roles: ['admin', 'sales_manager'] },
      { id: 'best-clients', label: 'Best Clients', icon: I.flag, roles: ['admin', 'sales_manager'] },
      { id: 'profit-analytics', label: 'Profit Analytics', icon: I.profit, roles: ['admin', 'sales_manager'] },
      { id: 'inquiry-funnel', label: 'Inquiry Funnel', icon: I.inquiry, roles: ['admin', 'sales_manager'] },
      { id: 'monthly-report', label: 'Monthly Report', icon: I.calendar, roles: ['admin', 'sales_manager'] },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { id: 'service-territories', label: 'Service Territories', icon: I.map, roles: ['admin'] },
      { id: 'daily-targets', label: 'Daily Targets', icon: I.target, roles: ['admin'] },
      { id: 'system-settings', label: 'System Settings', icon: I.config, roles: ['admin'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'user-management', label: 'User Management', icon: I.customer, roles: ['admin'] },
    ],
  },
]


const SCREEN_LABELS: Record<Screen, string> = {
  'dashboard': 'Executive Overview',
  'outreach-dashboard': 'Outreach Dashboard',
  'inquiry-dashboard': 'Inquiry Dashboard',
  'prospects': 'Prospect Clients',
  'warm-leads': 'Warm Leads',
  'inquiries': 'Inquiries',
  'quotations': 'Quotations',
  'sales-tracker': 'Sales Tracker',
  'customers': 'Customer Accounts',
  'contact-outreach': 'Contact Outreach Sheet',
  'contracts': 'Customer Contracts',
  'pickups': 'Pickup Tracking',
  'daily-tasks': 'Daily Completed Tasks',
  'removed': 'Removed Sheet',
  'deliverability': 'Deliverability Management',
  'container-catalog': 'Container Catalog',
  'pic-performance': 'PIC Performance',
  'best-clients': 'Best Clients',
  'profit-analytics': 'Profit Analytics',
  'inquiry-funnel': 'Inquiry Funnel',
  'monthly-report': 'Monthly Report',
  'service-territories': 'Service Territories',
  'daily-targets': 'Daily Targets',
  'system-settings': 'System Settings',
  'profile-settings': 'Profile Settings',
  'user-management': 'User Management',
  'inquiry-validation': 'Inquiry Validation',
  'inventory-management': 'Inventory Management',
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

type ProfitChartPoint = { m: string; profit: number; revenue: number; cost: number }
type ChartSlice = { name: string; value: number; color: string }
type PicPerformanceRow = {
  name: string
  initials: string
  profit: number
  sales: number
  units: number
  calls: number
  emails: number
  texts: number
  leads: number
  inquiries: number
  quotes: number
  revenue: number
}

type OverduePickupRow = { contract: string; co: string; days: number; qty: number; size: string }
type LossReasonRow = { reason: string; color: string; count: number }




// ─── Utility components ───────────────────────────────────────────────────────

const Ic = ({ n, size = 14, style }: { n: string; size?: number; style?: React.CSSProperties }) => (
  <Icon path={n} size={size} style={style} />
)

type BadgeStatus =
  | 'Proceed' | 'Removed' | 'Active' | 'Completed' | 'Lost' | 'Draft' | 'Sent'
  | 'New Inquiry' | 'Quotation Required' | 'Quotation Sent' | 'Negotiating' | 'Negotiation'
  | 'Converted to Sale' | 'Converted' | 'Pending' | 'Cancelled' | 'Call/Text' | 'Calls Only'
  | 'Text Only' | 'Mail Delivery Report' | 'Overdue' | 'Scheduled' | 'Confirmed'
  | 'Picked Up' | 'Accepted' | 'Rejected' | 'Under Review' | 'Awaiting Response'
  | 'Pending Validation' | 'Validation Rejected' | 'Quotation Created' | 'Quotation Rejected'

const BADGE_MAP: Record<string, string> = {
  'Proceed': 'b-green', 'Active': 'b-green', 'Completed': 'b-green', 'Accepted': 'b-green',
  'Converted to Sale': 'b-green', 'Converted': 'b-green', 'Picked Up': 'b-green',
  'Removed': 'b-red', 'Lost': 'b-red', 'Rejected': 'b-red', 'Overdue': 'b-red', 'Cancelled': 'b-red',
  'Validation Rejected': 'b-red', 'Quotation Rejected': 'b-red',
  'Pending': 'b-amber', 'Awaiting Response': 'b-amber', 'Under Review': 'b-amber', 'Pending Validation': 'b-amber',
  'New Inquiry': 'b-blue', 'Draft': 'b-blue', 'Call/Text': 'b-green', 'Quotation Created': 'b-blue',
  'Calls Only': 'b-blue', 'Mail Delivery Report': 'b-blue', 'Scheduled': 'b-blue', 'Confirmed': 'b-blue', 'Sent': 'b-blue',
  'Text Only': 'b-purple', 'Negotiating': 'b-purple', 'Negotiation': 'b-purple',
  'Quotation Required': 'b-amber', 'Quotation Sent': 'b-teal',
}

const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${BADGE_MAP[status] || 'b-gray'}`}>{status}</span>
)

const Trend = ({ val, up, white }: { val: string | number; up?: boolean; white?: boolean }) => {
  const strVal = String(val)
  const isZero = strVal === '0' || strVal === '0%'
  const numericVal = parseFloat(strVal.replace(/[^0-9.-]+/g, "") || "0")
  const isUp = up !== undefined ? up : numericVal > 0
  const isDown = !isUp && numericVal < 0

  if (isZero) {
    return (
      <span className={`trend ${white ? 'trend-up-white' : 'trend-neutral'}`}>
        - {strVal}
      </span>
    )
  }

  return (
    <span className={`trend ${white ? 'trend-up-white' : isUp ? 'trend-up' : 'trend-down'}`}>
      {isUp ? '↑' : '↓'} {strVal}
    </span>
  )
}

const Prog = ({ pct, color = '#315EF6', tall }: { pct: number; color?: string; tall?: boolean }) => {
  const safePct = isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div className={`prog${tall ? ' tall' : ''}`}>
      <div className="prog-fill" style={{ width: `${safePct}%`, background: color }} />
    </div>
  )
}

const Divider = () => <div className="divider" />

const Btn = ({ children, variant = 'secondary', sm, className = '', onClick, style, disabled, title }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  sm?: boolean; className?: string; onClick?: React.MouseEventHandler<HTMLButtonElement>; style?: React.CSSProperties
  disabled?: boolean; title?: string
}) => (
  <button
    className={`btn btn-${variant}${sm ? ' btn-sm' : ''} ${className}`}
    onClick={onClick} style={style} disabled={disabled} title={title}
  >{children}</button>
)

const EligDot = ({ on }: { on: boolean }) => (
  <div className="elig-dot" style={{ background: on ? '#059669' : '#E5E7EB' }} />
)

const ChipPIC = ({ label }: { label: string }) => (
  <span style={{ background: 'var(--brand-bg)', color: 'var(--brand)', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{label}</span>
)

const AssignPicModal = ({ count, onClose, onAssign }: { count: number; onClose: () => void; onAssign: (picId: string) => void }) => {
  const pics = usePics()
  const [picId, setPicId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Assign PIC</div>
          <Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Reassign {count} selected record{count === 1 ? '' : 's'} to:</p>
          <select className="inp" value={picId} onChange={e => setPicId(e.target.value)}>
            <option value="">-- Select a PIC --</option>
            {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" disabled={!picId || submitting} onClick={async () => { setSubmitting(true); await onAssign(picId) }}>
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// A read-only detail view for a single row of an already-loaded list (Inquiries, Quotations,
// Sales, Contracts, Customers, etc). No extra API call needed -- the row already has every
// field the table shows, this just lays them out full-size instead of squeezed into a table cell.
type DetailField = { label: string; value: React.ReactNode }
const RecordDetailModal = ({ title, fields, onClose, footerExtra }: { title: string; fields: DetailField[]; onClose: () => void; footerExtra?: React.ReactNode }) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title">{title}</div>
        <Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn>
      </div>
      <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {fields.map(f => (
          <div key={f.label} style={{ gridColumn: f.label.length > 24 ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>{f.value ?? <span style={{ color: 'var(--t4)' }}>—</span>}</div>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        {footerExtra}
      </div>
    </div>
  </div>
)

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar = ({ active, onNav, expanded, pinned, onTogglePin, role }: {
  active: Screen; onNav: (s: Screen) => void; expanded: boolean;
  pinned: boolean; onTogglePin: () => void;
  role?: string;
}) => {
  // Administration (User Management) and individual items with a `roles` allowlist (e.g.
  // Inquiry Validation, Procurement-only) are access-controlled; everything else is visible
  // to any authenticated role, see docs/CUSTOMERS_MODULE.md §5 for why that's a known,
  // not-yet-addressed gap for the rest of the app.
  const visibleGroups = NAV
    .filter(group => group.label !== 'Administration' || role === 'admin')
    .map(group => ({ ...group, items: group.items.filter(item => !item.roles || (role && item.roles.includes(role))) }))
    .filter(group => group.items.length > 0)

  return (
    <aside className={`sidebar${expanded ? ' expanded' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-icon">
          <Ic n={I.container} size={17} style={{ color: 'white' }} />
        </div>
        {expanded && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2 }}>ContainerCRM</div>
            <div style={{ fontSize: 10, color: 'var(--sb-text)', fontWeight: 500 }}>Enterprise</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {visibleGroups.map(group => (
          <div key={group.label}>
            <div className="sb-group-label">{group.label}</div>
            {group.items.map(item => (
              <button
                type="button"
                key={item.id}
                className={`sb-item${active === item.id ? ' active' : ''}`}
                onClick={() => onNav(item.id)}
                data-tooltip={item.label}
                title={expanded ? undefined : item.label}
                aria-current={active === item.id ? 'page' : undefined}
              >
                <div className="sb-icon-wrap">
                  <Ic n={item.icon} size={16} style={{ color: active === item.id ? 'white' : 'var(--sb-icon)' }} />
                </div>
                <span className="sb-item-label">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sb-bottom">
        <button
          type="button"
          className="sb-item"
          data-tooltip={pinned ? 'Collapse Sidebar' : 'Pin Sidebar Open'}
          title={pinned ? 'Collapse Sidebar' : 'Pin Sidebar Open'}
          onClick={onTogglePin}
        >
          <div className="sb-icon-wrap">
            <Ic n={pinned ? I.chevLeft : I.chevRight} size={16} style={{ color: 'var(--sb-icon)' }} />
          </div>
          <span className="sb-item-label">{pinned ? 'Collapse' : 'Pin Open'}</span>
        </button>
      </div>
    </aside>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

const NOTIFICATION_STYLE: Record<string, { icon: string; color: string }> = {
  inquiry_pending_validation: { icon: I.inquiry, color: 'var(--amber)' },
  inquiry_approved: { icon: I.check, color: 'var(--green)' },
  inquiry_rejected: { icon: I.x, color: 'var(--red)' },
}

const TopBar = ({ isDark, onToggleDark, session, onNav, role }: { isDark: boolean; onToggleDark: () => void; session: any; onNav: (s: Screen) => void; role?: string }) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  
  const [syncTime, setSyncTime] = useState(Date.now())
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncText, setSyncText] = useState('Synced just now')

  useEffect(() => {
    if (isSyncing) {
      setSyncText('Syncing...')
      return
    }
    const updateText = () => {
      const mins = Math.floor((Date.now() - syncTime) / 60000)
      setSyncText(mins === 0 ? 'Synced just now' : `Synced ${mins}m ago`)
    }
    updateText()
    const interval = setInterval(updateText, 30000)
    return () => clearInterval(interval)
  }, [syncTime, isSyncing])

  const handleManualSync = () => {
    if (isSyncing) return
    setIsSyncing(true)
    setTimeout(() => {
      setIsSyncing(false)
      setSyncTime(Date.now())
    }, 1200)
  }
  const userName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User'
  const initials = userName.substring(0, 2).toUpperCase()
  
  const { notifications, unread, refresh } = useNotifications()
  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }
  const markRead = (id: string) => api.patch(`/notifications/${id}/read`).then(refresh).catch(console.error)
  const markAllRead = () => api.patch('/notifications/read-all').then(refresh).catch(console.error)

  // Global search: hits the same search-capable endpoints the individual list screens
  // already use, and jumps to the right screen on click. It doesn't deep-link to the
  // exact record (that screen's own search box isn't pre-filled), only to the section --
  // still a real result, just not a full jump-to-record.
  const [gsQuery, setGsQuery] = useState('')
  const [gsResults, setGsResults] = useState<{ label: string; sub: string; screen: Screen }[]>([])
  const [gsOpen, setGsOpen] = useState(false)
  const [gsLoading, setGsLoading] = useState(false)
  useEffect(() => {
    const term = gsQuery.trim()
    if (term.length < 2) { setGsResults([]); return }
    setGsLoading(true)
    const handle = setTimeout(() => {
      Promise.all([
        api.get('/leads/prospects', { params: { search: term, limit: 5 } }).catch(() => ({ data: { data: [] } })),
        api.get('/leads/warm-leads', { params: { search: term, limit: 5 } }).catch(() => ({ data: { data: [] } })),
        api.get('/leads/inquiries', { params: { search: term, limit: 5 } }).catch(() => ({ data: { data: [] } })),
        api.get('/customers', { params: { search: term, limit: 5 } }).catch(() => ({ data: { data: [] } })),
      ]).then(([prospects, warmLeads, inquiries, customers]) => {
        const rows: { label: string; sub: string; screen: Screen }[] = [
          ...(prospects.data.data || []).map((r: any) => ({ label: r.companies?.name || r.contacts?.first_name || 'Prospect', sub: 'Prospect Client', screen: 'prospects' as Screen })),
          ...(warmLeads.data.data || []).map((r: any) => ({ label: r.companies?.name || r.contacts?.first_name || 'Warm Lead', sub: 'Warm Lead', screen: 'warm-leads' as Screen })),
          ...(inquiries.data.data || []).map((r: any) => ({ label: r.companies?.name || 'Inquiry', sub: `Inquiry — ${r.status || ''}`, screen: 'inquiries' as Screen })),
          ...(customers.data.data || []).map((r: any) => ({ label: r.company_name || 'Customer', sub: 'Customer Account', screen: 'customers' as Screen })),
        ]
        setGsResults(rows)
        setGsLoading(false)
      }).catch(() => setGsLoading(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [gsQuery])

  return (
    <header className="topbar">
      <div className="search-wrap" style={{ position: 'relative' }}>
        <Ic n={I.search} size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)' }} />
        <input
          placeholder="Search prospects, leads, inquiries, customers…"
          value={gsQuery}
          onChange={e => { setGsQuery(e.target.value); setGsOpen(true) }}
          onFocus={() => setGsOpen(true)}
          onBlur={() => setTimeout(() => setGsOpen(false), 150)}
        />
        {gsOpen && gsQuery.trim().length >= 2 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 200, maxHeight: 320, overflowY: 'auto' }}>
            {gsLoading ? (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--t4)' }}>Searching…</div>
            ) : gsResults.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--t4)' }}>No matches for "{gsQuery}".</div>
            ) : (
              gsResults.map((r, i) => (
                <div
                  key={i}
                  onClick={() => { onNav(r.screen); setGsOpen(false); setGsQuery('') }}
                  style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: i < gsResults.length - 1 ? '1px solid var(--border-s)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{r.sub}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div 
          className="sync-pill" 
          onClick={handleManualSync} 
          style={{ cursor: isSyncing ? 'wait' : 'pointer', opacity: isSyncing ? 0.7 : 1 }}
        >
          <Ic n={I.sync} size={11} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncText}
        </div>

        <button className="tb-btn" onClick={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'}>
          <Ic n={isDark ? I.sun : I.moon} size={16} />
        </button>

        <div style={{ position: 'relative' }}>
          {showNotifs && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifs(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: -50, width: 320, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Notifications</div>
                  {unread > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', cursor: 'pointer' }} onClick={markAllRead}>Mark all as read</div>}
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--t3)', fontSize: 12.5 }}>
                      <Ic n={I.bell} size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div>You have no new notifications.</div>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const style = NOTIFICATION_STYLE[n.type] || { icon: I.bell, color: 'var(--brand)' }
                      return (
                        <div key={n.id} onClick={() => !n.read && markRead(n.id)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 12, cursor: n.read ? 'default' : 'pointer', background: !n.read ? 'rgba(49, 94, 246, 0.03)' : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = !n.read ? 'rgba(49, 94, 246, 0.03)' : 'transparent'}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${style.color}15`, color: style.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ic n={style.icon} size={14} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: !n.read ? 700 : 600, color: 'var(--t1)' }}>{n.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--t4)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{n.message}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
          <button className="tb-btn" onClick={() => setShowNotifs(!showNotifs)} title="Notifications">
            <Ic n={I.bell} size={17} />
            {unread > 0 && <span className="notif-dot" />}
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          {showAccountMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowAccountMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 220, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 0', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-s)', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{userName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{session?.user?.email}</div>
                </div>
                
                <div style={{ padding: '4px' }}>
                  <div onClick={() => { onNav('profile-settings'); setShowAccountMenu(false); }} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Ic n={I.customer} size={14} style={{ color: 'var(--t3)' }} />
                    My Profile
                  </div>
                  <div onClick={() => { onNav('system-settings'); setShowAccountMenu(false); }} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Ic n={I.config} size={14} style={{ color: 'var(--t3)' }} />
                    System Settings
                  </div>
                  <div onClick={() => supabase.auth.signOut()} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 13, fontWeight: 500 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--red-light, #FEE2E2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Logout
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="avatar-btn" onClick={() => setShowAccountMenu(!showAccountMenu)} style={{ cursor: 'pointer' }}>
            <div className="avatar">{initials}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.2 }}>{userName}</span>
              <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'capitalize' }}>
                {role ? role.replace('_', ' ') : 'Staff'}
              </span>
            </div>
            <Ic n={I.chevDown} size={12} style={{ color: 'var(--t4)', marginLeft: 2 }} />
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

  const topCustomers = useCustomers('All', '').slice(0, 5);
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
          <p className="greeting-title">{timeGreeting}, {userName} 👋</p>
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
          <Btn variant="ghost" sm onClick={() => window.print()}><Ic n={I.export} size={13} /> Export PDF</Btn>
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

// ─── Outreach Dashboard ───────────────────────────────────────────────────────

const OutreachDashboard = () => {
  const analytics = useAnalytics()
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
  const textsDone = outreach.texts || 0,  textsTarget = (Number(targets.daily_text_target) || 0) * workingDays

  const safePct = (done: number, tgt: number) => tgt > 0 ? Math.round((done / tgt) * 100) : 0

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
          <p className="greeting-title">Outreach Dashboard</p>
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
          <Btn variant="ghost" sm onClick={() => window.print()}><Ic n={I.export} size={13} /> Export PDF</Btn>
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
            <div className="kpi-label">Projected Period-End</div>
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
            <div className="kpi-label">Eligible Contacts</div>
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
                { k: 'Remaining', v: emailTarget - emailDone, color: 'var(--amber)' },
                { k: 'Completion', v: `${safePct(emailDone, emailTarget)}%`, color: 'var(--brand)' },
                { k: 'Valid Available', v: eligibleContacts, color: 'var(--green)' },
                { k: 'Excluded', v: excludedContacts, color: 'var(--red)' },
              ],
              status: safePct(emailDone, emailTarget) >= 100 ? 'Completed' : 'On Track', statusCls: 'b-blue',
            },
            {
              label: 'Call Target', icon: I.phone, color: '#0D9488', done: callsDone, target: callsPref,
              details: [
                { k: 'Answered', v: outreach.calls_answered || 0, color: 'var(--green)' },
                { k: 'No Answer', v: outreach.calls_unanswered || 0, color: 'var(--amber)' },
                { k: 'Remaining', v: Math.max(0, callsPref - callsDone), color: 'var(--brand)' },
                { k: 'Completion', v: `${safePct(callsDone, callsPref)}%`, color: 'var(--green)' },
              ],
              status: safePct(callsDone, callsPref) >= 100 ? 'Target Achieved' : 'Min Achieved', statusCls: 'b-green',
            },
            {
              label: 'Text / SMS Target', icon: I.inquiry, color: '#7C3AED', done: textsDone, target: textsTarget,
              details: [
                { k: 'Remaining', v: Math.max(0, textsTarget - textsDone), color: 'var(--amber)' },
                { k: 'Replies', v: outreach.text_replies || 0, color: 'var(--green)' },
                { k: 'Completion', v: `${safePct(textsDone, textsTarget)}%`, color: 'var(--brand)' },
                { k: 'Valid Available', v: eligibleContacts, color: 'var(--purple)' },
              ],
              status: safePct(textsDone, textsTarget) >= 100 ? 'Completed' : 'On Track', statusCls: 'b-teal',
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
                <span className={`badge ${t.statusCls}`}>{t.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{t.done}</span>
                <span style={{ fontSize: 13, color: 'var(--t4)' }}>/ {t.target}</span>
              </div>
              <Prog pct={(t.done / t.target) * 100} color={t.color} tall />
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
                { ch: 'Email', target: emailTarget.toString(), done: emailDone, rem: emailTarget - emailDone, pct: safePct(emailDone, emailTarget), status: safePct(emailDone, emailTarget) >= 100 ? 'Completed' : 'On Track', cls: 'b-blue' },
                { ch: 'Calls', target: `${callsPref} pref`, done: callsDone, rem: callsPref - callsDone > 0 ? callsPref - callsDone : 0, pct: safePct(callsDone, callsPref), status: safePct(callsDone, callsPref) >= 100 ? 'Completed' : 'Min Achieved', cls: 'b-green' },
                { ch: 'Texts (SMS)', target: textsTarget.toString(), done: textsDone, rem: textsTarget - textsDone, pct: safePct(textsDone, textsTarget), status: safePct(textsDone, textsTarget) >= 100 ? 'Completed' : 'Nearly Complete', cls: 'b-teal' },
              ].map(r => (
                <tr key={r.ch}>
                  <td style={{ fontWeight: 600 }}>{r.ch}</td>
                  <td className="mono">{r.target}</td>
                  <td className="r mono bold">{r.done}</td>
                  <td className="r mono" style={{ color: 'var(--amber)' }}>{r.rem}</td>
                  <td style={{ minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}><Prog pct={r.pct} /></div>
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{r.pct}%</span>
                    </div>
                  </td>
                  <td><span className={`badge ${r.cls}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

// ─── Inquiry Dashboard ────────────────────────────────────────────────────────

const InquiryDashboard = () => {
  const analytics = useAnalytics();
  const LOSS_REASONS: LossReasonRow[] = analytics?.charts?.LOSS_REASONS || [];
  const inquiries = useInquiries(0, 'all')
  const total = inquiries.length
  const pendingValidation = inquiries.filter(r => r.status === 'Pending Validation').length
  const validationRejected = inquiries.filter(r => r.status === 'Validation Rejected').length
  const underReview = inquiries.filter(r => r.status === 'Under Review').length
  const quotationCreated = inquiries.filter(r => r.status === 'Quotation Created').length
  const convertedToSale = inquiries.filter(r => r.status === 'Converted to Sale').length
  const funnelTotal = underReview + quotationCreated + convertedToSale
  const pct = (v: number) => funnelTotal > 0 ? Math.round((v / funnelTotal) * 100) : 0
  return (
  <div className="page-scroll">
    <div className="greeting-bar">
      <p className="greeting-title">Inquiry Dashboard</p>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Inquiries', val: String(total) },
          { label: 'Pending Validation', val: String(pendingValidation) },
          { label: 'Approved / Under Review', val: String(underReview) },
          { label: 'Converted to Sale', val: String(convertedToSale) },
          { label: 'Validation Rejected', val: String(validationRejected) },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 26 }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="chart-card">
          <div className="chart-title">Inquiry Conversion Funnel</div>
          <div className="chart-sub" style={{ marginBottom: 14 }}>Approved tickets, by stage</div>
          {[
            { label: 'Under Review', v: underReview, pct: pct(underReview), color: '#315EF6' },
            { label: 'Quotation Created', v: quotationCreated, pct: pct(quotationCreated), color: '#0D9488' },
            { label: 'Converted to Sale', v: convertedToSale, pct: pct(convertedToSale), color: '#059669' },
          ].map(r => (
            <div key={r.label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>{r.label}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{r.v}</span>
                  <span style={{ fontSize: 11, color: 'var(--t4)', width: 32, textAlign: 'right' }}>{r.pct}%</span>
                </div>
              </div>
              <Prog pct={r.pct} color={r.color} />
            </div>
          ))}
        </div>
        <div className="chart-card">
          <div className="chart-title">Loss Reason Analysis</div>
          <div className="chart-sub" style={{ marginBottom: 14 }}>Why inquiries were lost</div>
          {LOSS_REASONS.map(r => (
            <div key={r.reason} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5 }}>{r.reason}</span>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: r.color }}>{r.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
}

// ─── Prospect / Warm Lead Sheet ───────────────────────────────────────────────

const ProspectSheet = ({ mode = 'prospect', onNav }: { mode?: 'prospect' | 'warm'; onNav?: (s: Screen) => void }) => {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState<'active' | 'converted' | 'removed' | 'all'>('active')
  const [missingContactOnly, setMissingContactOnly] = useState(false)
  const [tab, setTab] = useState('Standard View')

  const [revision, setRevision] = useState(0)
  const [importMode, setImportMode] = useState<'file' | 'paste' | null>(null)
  const [showNewWarmLead, setShowNewWarmLead] = useState(false)
  const [showNewProspect, setShowNewProspect] = useState(false)
  const [inquiryWarmLeadId, setInquiryWarmLeadId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colField: string; colLabel: string } | null>(null);
  const [showAssignPic, setShowAssignPic] = useState(false)

  const _prospectsData = useProspects(revision, mode === 'prospect' ? status : 'active')
  const _warmData = useWarmLeads(revision)
  const prospectsData = mode === 'warm' ? _warmData : _prospectsData

  const handleConvert = async (id: string) => {
    try {
      await api.post(`/leads/prospects/${id}/convert-to-warm-lead`);
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Conversion failed.', 'error')
    }
  }

  const handleRemove = async (id: string) => {
    const { confirmed, reason } = await askReason({
      title: 'Remove from active lists',
      message: 'Why should this contact be removed from active CRM lists?',
      confirmLabel: 'Remove',
    })
    if (!confirmed || !reason) return
    try {
      await api.post(`/leads/${mode === 'prospect' ? 'prospect' : 'warm_lead'}/${id}/remove`, { reason })
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Removal failed.', 'error')
    }
  }

  const handleAssignPic = async (picId: string) => {
    const stage = mode === 'prospect' ? 'prospect' : 'warm_lead'
    const results = await Promise.allSettled(
      selected.map(id => api.patch(`/leads/${stage}/${id}/pic`, { picId }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setShowAssignPic(false)
    setSelected([])
    setRevision(value => value + 1)
    if (failed > 0) toast(`${failed} of ${selected.length} records could not be reassigned.`, 'error')
  }

  const label = mode === 'prospect' ? 'Prospect Clients' : 'Warm Leads'
  const desc = mode === 'prospect'
    ? 'Companies identified for outreach who have not yet replied or requested pricing.'
    : 'Prospects who replied, showed interest, or requested a quotation.'

  const countries = [...new Set(prospectsData.map(r => r.country).filter(Boolean))].sort() as string[]
  const industries = [...new Set(prospectsData.map(r => r.industry).filter(Boolean))].sort() as string[]
  const filtered = prospectsData.filter(r => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [r.company, r.city, r.contact, r.emailAddr, r.phone]
      .some(value => String(value || '').toLowerCase().includes(term))
    return matchesSearch
      && (!category || r.cat === category)
      && (!country || r.country === country)
      && (!industry || r.industry === industry)
      && (!missingContactOnly || r.contactMissing)
  })

  const proceed = filtered.filter(r => r.cat === 'Proceed').length
  const callElig = filtered.filter(r => r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only')).length
  const textElig = filtered.filter(r => r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only')).length
  const emailElig = filtered.filter(r => r.cat === 'Proceed' && r.emailAddr).length
  const missingContact = prospectsData.filter(r => r.contactMissing).length

  const COLS = [
    { key: 'A', label: 'Date Added', field: 'added', w: 108 },
    { key: 'B', label: 'PIC', field: 'pic', w: 56 },
    { key: 'C', label: 'Category', field: 'cat', w: 90, badge: true },
    { key: 'D', label: 'SMS Deliv.', field: 'sms', w: 100, badge: true },
    { key: 'E', label: 'Email Deliv.', field: 'email', w: 148, badge: true },
    { key: 'F', label: 'Industry', field: 'industry', w: 110 },
    { key: 'G', label: 'Territory', field: 'territory', w: 110 },
    { key: 'H', label: 'Country', field: 'country', w: 120 },
    { key: 'I', label: 'State/Province', field: 'state', w: 120 },
    { key: 'J', label: 'City', field: 'city', w: 108 },
    { key: 'K', label: 'Company Name', field: 'company', w: 210 },
    { key: 'L', label: 'Contact Person', field: 'contact', w: 140 },
    { key: 'M', label: 'Direct Line', field: 'phone', w: 148, mono: true },
    { key: 'N', label: 'Phone 2', field: 'phone2', w: 140, mono: true },
    { key: 'O', label: 'Email — Active', field: 'emailAddr', w: 200, mono: true },
    { key: 'P', label: 'Email 2', field: 'email2', w: 180, mono: true },
    { key: 'Q', label: 'Address', field: 'address', w: 260 },
  ]

  const getVal = (row: ReturnType<typeof mapPipelineRow>, field: string): string =>
    (row as any)[field] || ''

  // Each tab is a real column subset of COLS rather than a decorative label --
  // null means "show everything."
  const VIEW_FIELDS: Record<string, string[] | null> = {
    'Standard View':  null,
    'Address Prep':   ['company', 'contact', 'country', 'state', 'city', 'address', 'phone'],
    'Compact Outreach': ['company', 'contact', 'pic', 'cat', 'phone', 'emailAddr'],
  }
  const visibleCols = VIEW_FIELDS[tab] ? COLS.filter(c => VIEW_FIELDS[tab]!.includes(c.field)) : COLS

  const [density, setDensity] = useState<'Compact' | 'Standard' | 'Comfortable'>('Standard')
  const rowHeight = density === 'Compact' ? 30 : density === 'Comfortable' ? 46 : 38

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">{label}</div>
          <div className="page-desc">{desc}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mode === 'prospect' && <Btn variant="primary" sm onClick={() => setImportMode('file')}><Ic n={I.upload} size={13} /> Import Excel</Btn>}
          {mode === 'prospect' && <Btn variant="secondary" sm onClick={() => setShowNewProspect(true)}><Ic n={I.plus} size={13} /> New Prospect</Btn>}
          {mode === 'warm' && <Btn variant="primary" sm onClick={() => setShowNewWarmLead(true)}><Ic n={I.plus} size={13} /> New Warm Lead</Btn>}
          {mode === 'prospect' && <Btn variant="secondary" sm onClick={() => setImportMode('paste')}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>}
          <ExportMenu data={filtered} filename="pipeline_data" />
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        {[
          { label: 'Total', val: filtered.length, color: 'var(--t3)' },
          { label: 'Proceed', val: proceed, color: 'var(--green)' },
          { label: 'Call Eligible', val: callElig, color: '#0D9488' },
          { label: 'Text Eligible', val: textElig, color: 'var(--purple)' },
          { label: 'Email Eligible', val: emailElig, color: 'var(--brand)' },
        ].map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 14, borderRight: '1px solid var(--border-s)' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>{s.val}</span>
            <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{s.label}</span>
          </div>
        ))}
        {mode === 'prospect' && missingContact > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMissingContactOnly(value => !value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999,
              background: missingContactOnly ? 'var(--amber-bg, #FEF3C7)' : 'transparent',
              border: '1px solid var(--amber, #D97706)', color: 'var(--amber, #D97706)',
            }}
            title="Companies imported without a named contact yet"
          >
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)' }}>{missingContact}</span>
            <span style={{ fontSize: 11.5 }}>Missing Contact{missingContactOnly ? ' — showing only these' : ''}</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-field">
          <Ic n={I.search} size={13} />
          <input placeholder={`Search ${label}…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="sel" value={category} onChange={e => setCategory(e.target.value)}><option value="">All Categories</option><option value="Proceed">Proceed</option></select>
        <select className="sel" value={country} onChange={e => setCountry(e.target.value)}><option value="">All Countries</option>{countries.map(value => <option key={value}>{value}</option>)}</select>
        <select className="sel" value={industry} onChange={e => setIndustry(e.target.value)}><option value="">All Industries</option>{industries.map(value => <option key={value}>{value}</option>)}</select>
        {mode === 'prospect' && (
          <select className="sel" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
            <option value="active">Active Prospects</option>
            <option value="converted">Converted</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        )}

        {selected.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--brand-bg)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
            {selected.length} selected
            <Btn variant="ghost" sm onClick={() => setShowAssignPic(true)}>Assign PIC</Btn>
            {mode === 'prospect'
              ? <Btn variant="ghost" sm onClick={() => Promise.all(selected.map(handleConvert))}>→ Warm Lead</Btn>
              : <Btn variant="ghost" sm onClick={() => setInquiryWarmLeadId(selected[0])}>Create Inquiry</Btn>
            }
          </div>
        )}

        <div className="toolbar-right">
          <span className="count-label">{filtered.length} records</span>
          <Btn
            variant="ghost" sm
            onClick={() => {
              const withPhone = filtered.filter(r => r.phone)
              if (!withPhone.length) return toast('No phone numbers in the current view to copy.', 'error')
              navigator.clipboard.writeText(withPhone.map(r => r.phone).join('\n'))
              toast(`Copied ${withPhone.length} phone numbers for RingCentral.`, 'success')
            }}
          >
            <Ic n={I.phone} size={13} /> Copy for RingCentral
          </Btn>
        </div>
      </div>

      {/* Tabs -- each one shows a real subset of columns, see VIEW_FIELDS above */}
      <div className="tabs">
        {Object.keys(VIEW_FIELDS).map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {/* Spreadsheet table */}
      <div className="table-wrap">
        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160 }}>
              <div 
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => {
                  const dataToCopy = filtered.map(r => getVal(r, contextMenu.colField)).filter(Boolean).join('\n');
                  navigator.clipboard.writeText(dataToCopy);
                  setContextMenu(null);
                  toast(`Copied ${filtered.map(r => getVal(r, contextMenu.colField)).filter(Boolean).length} ${contextMenu.colLabel}s to clipboard.`, 'success');
                }}
              >
                <Ic n={I.copy} size={14} style={{ color: 'var(--brand)' }} />
                Copy Column ({contextMenu.colLabel})
              </div>
            </div>
          </>
        )}
        <div style={{ minWidth: 'max-content' }}>
          {/* Column header row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 5, background: 'var(--s2)', borderBottom: '2px solid var(--border)' }}>
            {/* Row num + checkbox */}
            <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', background: 'var(--s2)', position: 'sticky', left: 0, zIndex: 6 }}>
              <input type="checkbox" className="cb" onChange={e => setSelected(e.target.checked ? filtered.map(r => r.id) : [])} />
            </div>
            {visibleCols.map(col => (
              <div
                key={col.key}
                style={{ minWidth: col.w, width: col.w, padding: '7px 12px', borderRight: '1px solid var(--border)', cursor: 'context-menu', userSelect: 'none', display: 'flex', alignItems: 'center' }}
                title={`Right-click to copy all ${col.label}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: col.field, colLabel: col.label });
                }}
              >
                <div>
                  <span className="col-header-letter">{col.key}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
                </div>
              </div>
            ))}
            <div style={{ minWidth: 160, width: 160, padding: '7px 12px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>ACTIONS</span>
            </div>
          </div>

          {/* Data rows */}
          {filtered.map((row, ri) => {
            const isRemoved = row.cat === 'Removed'
            const isSel = selected.includes(row.id)
            return (
              <div
                key={row.id}
                style={{ display: 'flex', background: isSel ? 'var(--brand-50)' : isRemoved ? 'var(--red-bg)' : ri % 2 === 1 ? 'var(--s2)' : 'var(--ws)', borderBottom: '1px solid var(--border-s)', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => setSelected(s => s.includes(row.id) ? s.filter(x => x !== row.id) : [...s, row.id])}
              >
                {/* Checkbox + row num */}
                <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-s)', background: 'var(--s2)', position: 'sticky', left: 0, zIndex: 1, gap: 4 }}>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={isSel}
                    onChange={() => setSelected(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}
                    onClick={e => e.stopPropagation()}
                  />
                  <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{ri + 1}</span>
                </div>
                {visibleCols.map(col => {
                  const val = getVal(row, col.field)
                  return (
                    <div key={col.key} style={{ minWidth: col.w, width: col.w, padding: '0 12px', height: rowHeight, display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-s)', overflow: 'hidden' }}>
                      {col.field === 'contact' && row.contactMissing ? (
                        <span style={{ fontSize: 11.5, color: 'var(--amber, #D97706)', fontStyle: 'italic' }}>No contact yet</span>
                      ) : col.badge && val ? (
                        <Badge status={val as BadgeStatus} />
                      ) : col.mono ? (
                        <span className="mono truncate" style={{ fontSize: 12, color: col.field === 'emailAddr' ? 'var(--brand)' : 'var(--t2)' }}>{val || <span style={{ color: 'var(--border)' }}>—</span>}</span>
                      ) : (
                        <span className="truncate" style={{ fontSize: 12.5, color: col.field === 'company' ? 'var(--t1)' : col.field === 'pic' ? 'var(--brand)' : 'var(--t2)', fontWeight: col.field === 'company' ? 600 : col.field === 'pic' ? 700 : 400 }}>
                          {val || <span style={{ color: 'var(--border)' }}>—</span>}
                        </span>
                      )}
                    </div>
                  )
                })}
                <div style={{ minWidth: 160, width: 160, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {mode === 'prospect'
                    ? <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={(e) => { e.stopPropagation(); handleConvert(row.id); }}>→ Warm</Btn>
                    : <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={(e) => { e.stopPropagation(); setInquiryWarmLeadId(row.id); }}>Inquiry</Btn>
                  }
                  <Btn variant="ghost" sm style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); handleRemove(row.id); }}>Remove</Btn>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '7px 20px', background: 'var(--s2)', borderTop: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--t4)', flexShrink: 0 }}>
        <span>Showing {filtered.length} of {prospectsData.length} active records</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['Compact', 'Standard', 'Comfortable'] as const).map(d => (
            <button
              key={d} className="btn btn-ghost btn-xs"
              style={{ fontWeight: density === d ? 600 : 400, color: density === d ? 'var(--brand)' : undefined }}
              onClick={() => setDensity(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      {importMode && (
        <ProspectImportDialog
          key={importMode}
          open
          initialMode={importMode}
          onClose={() => setImportMode(null)}
          onImported={() => setRevision(value => value + 1)}
        />
      )}
      {showNewWarmLead && (
        <NewWarmLeadDialog
          onClose={() => setShowNewWarmLead(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {showNewProspect && (
        <NewProspectDialog
          onClose={() => setShowNewProspect(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {inquiryWarmLeadId && (
        <NewInquiryDialog
          warmLeads={prospectsData as WarmLeadOption[]}
          initialId={inquiryWarmLeadId}
          onClose={() => setInquiryWarmLeadId(null)}
          onSaved={() => { setSelected([]); setRevision(value => value + 1) }}
        />
      )}
      {showAssignPic && (
        <AssignPicModal
          count={selected.length}
          onClose={() => setShowAssignPic(false)}
          onAssign={handleAssignPic}
        />
      )}
    </div>
  )
}

// ─── Inquiry List ─────────────────────────────────────────────────────────────

const InquiryList = () => {
  const [revision, setRevision] = useState(0)
  const [showNewInquiry, setShowNewInquiry] = useState(false)
  const [quotationInquiryId, setQuotationInquiryId] = useState<string | null>(null)
  const [viewRow, setViewRow] = useState<any>(null)
  const INQUIRIES = useInquiries(revision)
  const warmLeads = useWarmLeads(revision)
  const [tab, setTab] = useState('All')
  const [lookup, setLookup] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colField: string; colLabel: string } | null>(null);
  // These match the real inquiry.status values the backend actually sets (see
  // 031_inquiry_ticketing_and_notifications.sql) -- not a larger aspirational list.
  const tabs = ['All', 'Pending Validation', 'Under Review', 'Validation Rejected']
  const [channel, setChannel] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const pics = [...new Set(INQUIRIES.map(r => r.pic).filter(Boolean))].sort() as string[]
  const [actionError, setActionError] = useState('')

  const applyAlternative = async (id: string) => {
    setActionError('')
    try {
      await api.post(`/leads/inquiries/${id}/apply-alternative`)
      setRevision(v => v + 1)
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message ?? 'Could not apply the alternative offer.')
    }
  }

  const filtered = INQUIRIES.filter(r => {
    const tabMatch = tab === 'All' || r.status === tab
    const term = lookup.trim().toLowerCase()
    const channelMatch = !channel || r.channel === channel
    const picMatch = !picFilter || r.pic === picFilter
    // Phone matching ignores formatting so "2065550088" finds "+1-206-555-0088".
    const digits = term.replace(/\D/g, '')
    const phoneMatch = digits.length >= 4 && String(r.phone).replace(/\D/g, '').includes(digits)
    return tabMatch && channelMatch && picMatch && (!term
      || phoneMatch
      || [r.company, r.contact, r.ref, r.category, r.phone, r.email].some(value => String(value).toLowerCase().includes(term)))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showNewInquiry && (
        <NewInquiryDialog
          warmLeads={warmLeads as WarmLeadOption[]}
          onClose={() => setShowNewInquiry(false)}
          onSaved={() => { setShowNewInquiry(false); setRevision(value => value + 1); }}
        />
      )}
      {quotationInquiryId && (
        <QuotationDialog
          inquiries={INQUIRIES as InquiryOption[]}
          initialId={quotationInquiryId}
          onClose={() => setQuotationInquiryId(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {/* Lookup bar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', background: 'var(--ws)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Quick Contact Lookup</div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
          <input className="inp sm" placeholder="Enter phone number, email, company or ref…" value={lookup} onChange={e => setLookup(e.target.value)} style={{ flex: 1 }} />
          {lookup.trim() && <Btn variant="secondary" sm onClick={() => setLookup('')}><Ic n={I.x} size={13} /> Clear</Btn>}
          <Btn variant="primary" sm onClick={() => setShowNewInquiry(true)}><Ic n={I.plus} size={13} /> New Inquiry</Btn>
        </div>
        {lookup.trim() && (
          <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 6 }}>
            {filtered.length === 0 ? 'No inquiries match that contact.' : `${filtered.length} matching ${filtered.length === 1 ? 'inquiry' : 'inquiries'}`}
          </div>
        )}
      </div>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 20px', flexShrink: 0, background: 'var(--ws)', borderBottom: '1px solid var(--border-s)' }}>
        {[
          { label: 'Pending Validation', val: INQUIRIES.filter(r => r.status === 'Pending Validation').length, icon: I.warning, color: '#D97706' },
          { label: 'Approved / Under Review', val: INQUIRIES.filter(r => r.status === 'Under Review').length, icon: I.check, color: '#315EF6' },
          { label: 'Validation Rejected', val: INQUIRIES.filter(r => r.status === 'Validation Rejected').length, icon: I.x, color: '#DC2626' },
          { label: 'Quotation Rejected', val: INQUIRIES.filter(r => r.status === 'Quotation Rejected').length, icon: I.x, color: '#EA580C' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic n={s.icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-field">
          <Ic n={I.search} size={13} />
          <input placeholder="Search inquiries…" value={lookup} onChange={e => setLookup(e.target.value)} />
        </div>
        <select className="sel" value={channel} onChange={e => setChannel(e.target.value)}><option value="">All Channels</option><option value="Email">Email</option><option value="Direct">Direct</option></select>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{pics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <div className="toolbar-right">
          <span className="count-label">{filtered.length} inquiries</span>
          <ExportMenu data={filtered} filename="inquiries" />
        </div>
      </div>
      {actionError && <div style={{ margin: '0 20px 10px', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}

      {/* Table */}
      <div className="table-wrap">
        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160 }}>
              <div 
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => {
                  const dataToCopy = filtered.map((r: any) => r[contextMenu.colField]).filter(Boolean).join('\n');
                  navigator.clipboard.writeText(dataToCopy);
                  setContextMenu(null);
                  toast(`Copied ${filtered.map((r: any) => r[contextMenu.colField]).filter(Boolean).length} ${contextMenu.colLabel.toLowerCase()}.`, 'success');
                }}
              >
                <Ic n={I.copy} size={14} style={{ color: 'var(--brand)' }} />
                Copy Column ({contextMenu.colLabel})
              </div>
            </div>
          </>
        )}
        <table className="crm">
          <thead>
            <tr>
              <th>Inquiry #</th><th>Date / Time</th><th>Channel</th>
              <th 
                style={{ cursor: 'context-menu' }} 
                title="Right-click to copy all companies"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: 'company', colLabel: 'Companies' });
                }}
              >Company</th>
              <th 
                style={{ cursor: 'context-menu' }} 
                title="Right-click to copy all contacts"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: 'contact', colLabel: 'Contacts' });
                }}
              >Contact</th>
              <th>Category</th><th>Size</th><th className="r">Qty</th><th>Needed By</th><th>Status</th><th>PIC</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.ref}>
                <td><span className="ref-id">{row.ref}</span></td>
                <td>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{row.date}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{row.time}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                    <Ic n={( { Phone: I.phone, Email: I.mail, SMS: I.inquiry, RingCentral: I.phone } as Record<string, string>)[String(row.channel)] || I.inquiry} size={12} style={{ color: 'var(--t3)' }} />
                    {row.channel}
                  </div>
                </td>
                <td style={{ fontWeight: 600, fontSize: 12.5 }}>{row.company}</td>
                <td style={{ fontSize: 12.5 }}>{row.contact}</td>
                <td style={{ fontSize: 12 }}>{row.category}</td>
                <td className="mono">{row.size}</td>
                <td className="r mono bold">{row.qty}</td>
                <td className="mono">{row.neededBy}</td>
                <td><Badge status={row.status as BadgeStatus} /></td>
                <td><ChipPIC label={row.pic} /></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(row)}>View</Btn>
                    {['Under Review', 'Quotation Rejected'].includes(row.status) && (
                      <Btn variant="ghost" sm style={{ color: 'var(--purple)' }} onClick={() => setQuotationInquiryId(row.id)}>→ Quote</Btn>
                    )}
                    {row.status === 'Validation Rejected' && row.hasAlternative && (
                      <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => applyAlternative(row.id)}>Use Alternative</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Inquiry ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.company },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Channel', value: viewRow.channel },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Container size', value: viewRow.size },
            { label: 'Condition', value: viewRow.condition },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Needed by', value: viewRow.neededBy },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Received', value: `${viewRow.date} ${viewRow.time}` },
            ...(viewRow.rejectionReason ? [{ label: 'Rejection reason', value: viewRow.rejectionReason }] : []),
            ...(viewRow.altSize ? [{ label: 'Alternative size', value: viewRow.altSize }] : []),
            ...(viewRow.altCondition ? [{ label: 'Alternative condition', value: viewRow.altCondition }] : []),
            ...(viewRow.altQuantity != null ? [{ label: 'Alternative quantity', value: viewRow.altQuantity }] : []),
            ...(viewRow.altAskingPrice != null ? [{ label: 'Alternative asking price', value: `$${viewRow.altAskingPrice.toLocaleString()}` }] : []),
            ...(viewRow.altNotes ? [{ label: 'Alternative offer notes', value: viewRow.altNotes }] : []),
          ]}
        />
      )}
    </div>
  )
}

// ─── Quotation List ───────────────────────────────────────────────────────────

const QuotationList = () => {
  const [revision, setRevision] = useState(0)
  const [showQuotation, setShowQuotation] = useState(false)
  const [saleQuotationId, setSaleQuotationId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [viewRow, setViewRow] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const quotes = useQuotations(revision)
  const inquiries = useInquiries(revision)
  const quotePics = [...new Set(quotes.map(q => q.pic).filter(Boolean))].sort() as string[]
  const filteredQuotes = quotes.filter(q => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [q.co, q.contact, q.ref, q.category].some(value => String(value).toLowerCase().includes(term))
    const statusMatch = !statusFilter || q.status === statusFilter
    const picMatch = !picFilter || q.pic === picFilter
    return searchMatch && statusMatch && picMatch
  })

  const acceptQuotation = async (id: string) => {
    setActionError('')
    try {
      await api.patch(`/deals/quotations/${id}/status`, { status: 'Accepted' })
      setRevision(value => value + 1)
    } catch (error: any) {
      setActionError(error.response?.data?.error?.message ?? error.message ?? 'Could not accept the quotation.')
    }
  }

  const removeQuotation = async (id: string) => {
    const { confirmed, reason } = await askReason({
      title: 'Remove quotation',
      message: 'Why should this quotation be removed?',
      confirmLabel: 'Remove',
    })
    if (!confirmed || !reason) return
    setActionError('')
    try {
      await api.post(`/leads/quotation/${id}/remove`, { reason })
      setRevision(value => value + 1)
    } catch (error: any) {
      setActionError(error.response?.data?.error?.message ?? error.message ?? 'Could not remove the quotation.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showQuotation && (
        <QuotationDialog
          inquiries={inquiries as InquiryOption[]}
          onClose={() => setShowQuotation(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {saleQuotationId && (
        <SaleDialog
          quotations={quotes as QuotationOption[]}
          initialId={saleQuotationId}
          onClose={() => setSaleQuotationId(null)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '16px 20px', flexShrink: 0, background: 'var(--ws)', borderBottom: '1px solid var(--border-s)' }}>
        {[
          { label: 'Draft', val: quotes.filter(q => q.status === 'Draft').length, icon: I.edit, color: '#6B7280' },
          { label: 'Sent', val: quotes.filter(q => q.status === 'Sent').length, icon: I.mail, color: '#315EF6' },
          { label: 'Viewed', val: quotes.filter(q => q.status === 'Viewed').length, icon: I.search, color: '#7C3AED' },
          { label: 'Accepted', val: quotes.filter(q => q.status === 'Accepted').length, icon: I.check, color: '#059669' },
          { label: 'Rejected', val: quotes.filter(q => q.status === 'Rejected').length, icon: I.x, color: '#DC2626' },
          { label: 'Converted', val: quotes.filter(q => q.status === 'Converted').length, icon: I.sales, color: '#0D9488' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic n={s.icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search quotations…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Viewed">Viewed</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Converted">Converted</option>
        </select>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{quotePics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <div className="toolbar-right">
          <ExportMenu data={filteredQuotes} filename="quotations" />
          <Btn variant="primary" sm onClick={() => setShowQuotation(true)}><Ic n={I.plus} size={13} /> Create Quotation</Btn>
        </div>
      </div>
      {actionError && <div style={{ margin: '0 20px 10px', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Quote #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th className="r">Qty</th><th className="r">Total Sell</th><th className="r">Est. Profit</th>
            <th className="r">Margin</th><th>Status</th><th>Source</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {filteredQuotes.map(q => (
              <tr key={q.ref}>
                <td><span className="ref-id" style={{ color: 'var(--purple)' }}>{q.ref}</span></td>
                <td style={{ fontSize: 12.5 }}>{q.date}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{q.co}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{q.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{q.category}</td>
                <td className="mono">{q.size}</td>
                <td className="r mono bold">{q.qty}</td>
                <td className="r revenue-cell">${q.sellTotal.toLocaleString()}</td>
                <td className="r profit-cell">${q.profit.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{q.margin.toFixed(1)}%</td>
                <td><Badge status={q.status as BadgeStatus} /></td>
                <td><span className="ref-id" style={{ color: 'var(--orange)', fontSize: 11 }}>{q.source}</span></td>
                <td><ChipPIC label={q.pic} /></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <Btn variant="ghost" sm onClick={() => setViewRow(q)}>View</Btn>
                    {['Draft', 'Sent', 'Viewed'].includes(q.status) && <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => acceptQuotation(q.id)}>Accept</Btn>}
                    {q.status === 'Accepted' && <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => setSaleQuotationId(q.id)}>→ Sale</Btn>}
                    {q.status !== 'Converted' && <Btn variant="ghost" sm style={{ color: 'var(--red)' }} onClick={() => removeQuotation(q.id)}>Remove</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Quotation ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.co },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Total sell', value: `$${viewRow.sellTotal.toLocaleString()}` },
            { label: 'Est. profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Margin', value: `${viewRow.margin.toFixed(1)}%` },
            { label: 'Source inquiry', value: viewRow.source },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Date', value: viewRow.date },
          ]}
        />
      )}
    </div>
  )
}

// ─── Sales Tracker ────────────────────────────────────────────────────────────

const SalesTracker = () => {
  const [revision, setRevision] = useState(0)
  const [showSale, setShowSale] = useState(false)
  const [showManualSale, setShowManualSale] = useState(false)
  const [viewRow, setViewRow] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateRange, setDateRange] = useState('All Time')
  const SALES = useSales(revision)
  const quotations = useQuotations(revision)
  const salesPics = [...new Set(SALES.map(s => s.pic).filter(Boolean))].sort() as string[]
  const salesCategories = [...new Set(SALES.map(s => s.category).filter(Boolean))].sort() as string[]

  const filteredSales = SALES.filter(s => {
    const term = search.trim().toLowerCase()
    const searchMatch = !term || [s.company, s.contact, s.ref, s.category].some(value => String(value).toLowerCase().includes(term))
    const picMatch = !picFilter || s.pic === picFilter
    const categoryMatch = !categoryFilter || s.category === categoryFilter
    let dateMatch = true
    if (dateRange !== 'All Time' && s.createdAt) {
      const saleDate = new Date(s.createdAt)
      const now = new Date()
      if (dateRange === 'This Month') {
        dateMatch = saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth()
      } else if (dateRange === 'Last Month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        dateMatch = saleDate.getFullYear() === lastMonth.getFullYear() && saleDate.getMonth() === lastMonth.getMonth()
      }
    }
    return searchMatch && picMatch && categoryMatch && dateMatch
  })

  const totalBuy = filteredSales.reduce((s, r) => s + r.totalBuy, 0)
  const totalSell = filteredSales.reduce((s, r) => s + r.totalSell, 0)
  const totalProfit = filteredSales.reduce((s, r) => s + r.profit, 0)
  const totalUnits = filteredSales.reduce((s, r) => s + r.qty, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showSale && (
        <SaleDialog
          quotations={quotations as QuotationOption[]}
          onClose={() => setShowSale(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {showManualSale && (
        <NewManualSaleDialog
          onClose={() => setShowManualSale(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {/* Financial KPI strip */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-s)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { label: 'Units Sold', val: totalUnits.toString(), color: '#7C3AED', fmt: false },
          { label: 'Buying Cost', val: `$${totalBuy.toLocaleString()}`, color: 'var(--t3)', fmt: false },
          { label: 'Total Revenue', val: `$${totalSell.toLocaleString()}`, color: 'var(--brand)', fmt: false },
          { label: 'Gross Profit', val: `$${totalProfit.toLocaleString()}`, color: 'var(--green)', fmt: false },
          { label: 'Avg Margin', val: `${(totalSell ? totalProfit / totalSell * 100 : 0).toFixed(1)}%`, color: '#0D9488', fmt: false },
        ].map(k => (
          <div key={k.label} style={{ textAlign: 'center', padding: '8px 0', borderRight: '1px solid var(--border-s)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search sales…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{salesPics.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <select className="sel" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All Categories</option>{salesCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select className="sel" value={dateRange} onChange={e => setDateRange(e.target.value)}><option>This Month</option><option>Last Month</option><option>All Time</option></select>
        <div className="toolbar-right">
          <ExportMenu data={filteredSales} filename="sales" />
          <Btn variant="secondary" sm onClick={() => setShowManualSale(true)}><Ic n={I.plus} size={13} /> Record Sale Manually</Btn>
          <Btn variant="primary" sm onClick={() => setShowSale(true)}><Ic n={I.plus} size={13} /> From Quotation</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Sale #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th>Condition</th><th className="r">Qty</th><th className="r">Buy/Unit</th>
            <th className="r">Sell/Unit</th><th className="r">Total Buy</th><th className="r">Total Sell</th>
            <th className="r">Profit</th><th className="r">Margin</th><th>PIC</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {filteredSales.map(s => (
              <tr key={s.ref}>
                <td><span className="ref-id">{s.ref}</span></td>
                <td style={{ fontSize: 12.5 }}>{s.date}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{s.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{s.contact}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{s.category}</td>
                <td className="mono">{s.size}</td>
                <td style={{ fontSize: 11.5, color: 'var(--t3)' }}>{s.condition}</td>
                <td className="r mono bold">{s.qty}</td>
                <td className="r cost-cell">${s.buyPU.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 600 }}>${s.sellPU.toLocaleString()}</td>
                <td className="r cost-cell">${s.totalBuy.toLocaleString()}</td>
                <td className="r revenue-cell">${s.totalSell.toLocaleString()}</td>
                <td className="r profit-cell">${s.profit.toLocaleString()}</td>
                <td className="r mono" style={{ fontWeight: 700, color: s.margin >= 30 ? 'var(--green)' : 'var(--amber)' }}>{s.margin.toFixed(1)}%</td>
                <td><ChipPIC label={s.pic} /></td>
                <td><Badge status={s.status as BadgeStatus} /></td>
                <td className="col-actions">
                  <div className="row-actions"><Btn variant="ghost" sm onClick={() => setViewRow(s)}>View</Btn></div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--s2)' }}>
              <td colSpan={6} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>Totals ({filteredSales.length} sales)</td>
              <td className="r mono bold" style={{ color: 'var(--t1)' }}>{totalUnits}</td>
              <td colSpan={2} />
              <td className="r cost-cell" style={{ fontWeight: 700 }}>${totalBuy.toLocaleString()}</td>
              <td className="r revenue-cell" style={{ fontWeight: 700 }}>${totalSell.toLocaleString()}</td>
              <td className="r profit-cell" style={{ fontWeight: 800, fontSize: 14 }}>${totalProfit.toLocaleString()}</td>
              <td className="r mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{(totalSell ? totalProfit / totalSell * 100 : 0).toFixed(1)}%</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      {viewRow && (
        <RecordDetailModal
          title={`Sale ${viewRow.ref}`}
          onClose={() => setViewRow(null)}
          fields={[
            { label: 'Company', value: viewRow.company },
            { label: 'Contact', value: viewRow.contact },
            { label: 'Status', value: <Badge status={viewRow.status as BadgeStatus} /> },
            { label: 'Category', value: viewRow.category },
            { label: 'Condition', value: viewRow.condition },
            { label: 'Quantity', value: viewRow.qty },
            { label: 'Total buy', value: `$${viewRow.totalBuy.toLocaleString()}` },
            { label: 'Total sell', value: `$${viewRow.totalSell.toLocaleString()}` },
            { label: 'Profit', value: `$${viewRow.profit.toLocaleString()}` },
            { label: 'Margin', value: `${viewRow.margin.toFixed(1)}%` },
            { label: 'PIC', value: viewRow.pic },
            { label: 'Date', value: viewRow.date },
          ]}
        />
      )}
    </div>
  )
}

// ─── Customer Accounts ────────────────────────────────────────────────────────

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
        {['All', 'Active', 'Floating'].map(t => <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
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

// ─── Contact Outreach Sheet ───────────────────────────────────────────────────

const ContactOutreach = () => {
  const prospectsData = useProspects()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState('')

  const term = search.trim().toLowerCase()
  const filtered = prospectsData.filter(r =>
    !term || [r.company, r.contact, r.phone, r.emailAddr].some(value => String(value ?? '').toLowerCase().includes(term))
  )

  const withElig = filtered.map(r => ({
    ...r,
    callable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only'),
    textable: r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only'),
    emailable: r.cat === 'Proceed' && !!r.emailAddr,
  }))

  const allSelected = withElig.length > 0 && withElig.every(r => selected.includes(r.id))
  const toggleAll = () => setSelected(allSelected ? [] : withElig.map(r => r.id))
  const toggleOne = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Copying operates on the selection when one exists, otherwise every currently-filtered row
  // -- so the buttons are useful with or without an explicit selection.
  const activeRows = selected.length > 0 ? withElig.filter(r => selected.includes(r.id)) : withElig

  const handleCopy = (type: string, build: (r: typeof withElig[number]) => string | null, eligibleOf: (r: typeof withElig[number]) => boolean) => {
    const eligible = activeRows.filter(r => r.cat !== 'Removed' && eligibleOf(r))
    const lines = eligible.map(build).filter((v): v is string => !!v)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied(`${type}|${lines.length}|${activeRows.length - eligible.length}`)
    setTimeout(() => setCopied(''), 4000)
  }

  const [copyLabel, eligibleCount, excludedCount] = copied ? copied.split('|') : ['', '0', '0']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Contact Outreach Sheet</div>
          <div className="page-desc">Select contacts (or leave none selected to use every row below) and copy for RingCentral, email, or SMS campaigns.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={() => handleCopy('Numbers', r => r.phone || null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy Numbers</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Emails', r => r.emailAddr || null, r => r.emailable)}><Ic n={I.copy} size={13} /> Copy Emails</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Name + Number', r => r.phone ? `${r.contact || r.company}\t${r.phone}` : null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy Name + Number</Btn>
          <Btn variant="secondary" sm onClick={() => handleCopy('Name + Email', r => r.emailAddr ? `${r.contact || r.company}\t${r.emailAddr}` : null, r => r.emailable)}><Ic n={I.copy} size={13} /> Copy Name + Email</Btn>
        </div>
      </div>

      {copied && (
        <div style={{ padding: '10px 20px', background: 'var(--green-bg)', borderBottom: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Ic n={I.check} size={14} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green-text)' }}>
            Copied "{copyLabel}" — {eligibleCount} eligible contact{eligibleCount === '1' ? '' : 's'} to clipboard. Excluded: {excludedCount} not eligible/removed.
          </span>
          <Btn variant="ghost" sm onClick={() => setCopied('')}><Ic n={I.x} size={13} /></Btn>
        </div>
      )}

      {/* Eligibility summary */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)', borderBottom: '1px solid var(--border-s)', flexShrink: 0 }}>
        {[
          { label: 'Call Eligible', val: withElig.filter(r => r.callable).length, color: 'var(--teal)' },
          { label: 'Text Eligible', val: withElig.filter(r => r.textable).length, color: 'var(--purple)' },
          { label: 'Email Eligible', val: withElig.filter(r => r.emailable).length, color: 'var(--brand)' },
          { label: 'Removed / Excluded', val: withElig.filter(r => r.cat === 'Removed').length, color: 'var(--red)' },
        ].map(e => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <strong style={{ color: e.color, fontFamily: 'var(--mono)' }}>{e.val}</strong> {e.label}
          </div>
        ))}
        {selected.length > 0 && <div style={{ marginLeft: 'auto', fontWeight: 600 }}>{selected.length} selected</div>}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="toolbar-right">
          <Btn variant="primary" sm style={{ background: '#1F2937' }} onClick={() => handleCopy('RingCentral Format', r => r.phone || null, r => r.callable || r.textable)}><Ic n={I.copy} size={13} /> Copy RingCentral Format</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" checked={allSelected} onChange={toggleAll} /></th>
            <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th>
            <th>City / State</th><th>PIC</th><th style={{ textAlign: 'center' }}>Call</th>
            <th style={{ textAlign: 'center' }}>Text</th><th style={{ textAlign: 'center' }}>Email</th>
          </tr></thead>
          <tbody>
            {withElig.map(r => (
              <tr key={r.id} style={{ background: r.cat === 'Removed' ? 'var(--red-bg)' : undefined }}>
                <td className="col-check"><input type="checkbox" className="cb" checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} /></td>
                <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{r.company}</td>
                <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.phone}</td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--brand)' }}>{r.emailAddr || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>{r.city}, {r.state}</td>
                <td><ChipPIC label={r.pic} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.callable} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.textable} /></td>
                <td style={{ textAlign: 'center' }}><EligDot on={r.emailable} /></td>
              </tr>
            ))}
            {withElig.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>No contacts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Contracts ────────────────────────────────────────────────────────────────

const Contracts = () => {
  const [status, setStatus] = useState('All Statuses');
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [revision, setRevision] = useState(0);
  const [viewRow, setViewRow] = useState<any>(null);
  const contracts = useContracts(status, pickStatus, search);
  // Re-fetch sales when clicking New Contract
  const sales = useSales(revision);
  const overdueContracts = contracts.filter(c => c.pickStatus === 'Overdue');

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
        <select className="sel" value={status} onChange={e => setStatus(e.target.value)}><option>All Statuses</option><option>Pending Signature</option><option>Active</option><option>Completed</option></select>
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
                  <div className="row-actions"><Btn variant="ghost" sm onClick={() => setViewRow(c)}>View</Btn></div>
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

// ─── Daily Tasks ──────────────────────────────────────────────────────────────

const ACTIVITY_SECTIONS: {
  title: string; icon: string; color: string;
  fields: { key: string; label: string; targetKey?: string }[]
}[] = [
  { title: 'Email Activity', icon: I.mail, color: '#315EF6', fields: [
    { key: 'emails_completed', label: 'Emails Completed', targetKey: 'daily_email_target' },
    { key: 'email_replies',    label: 'Email Replies' },
    { key: 'emails_bounced',   label: 'Bounced / Failed' },
  ]},
  { title: 'Call Activity', icon: I.phone, color: '#0D9488', fields: [
    { key: 'calls_completed',  label: 'Calls Completed', targetKey: 'daily_call_target_min' },
    { key: 'calls_answered',   label: 'Calls Answered' },
    { key: 'calls_unanswered', label: 'Calls Unanswered' },
  ]},
  { title: 'Text / SMS Activity', icon: I.inquiry, color: '#7C3AED', fields: [
    { key: 'texts_completed',  label: 'Texts Completed', targetKey: 'daily_text_target' },
    { key: 'text_replies',     label: 'Text Replies' },
    { key: 'texts_opted_out',  label: 'Opted Out' },
  ]},
]

const BLANK_ACTIVITY: Record<string, number> = Object.fromEntries(
  ACTIVITY_SECTIONS.flatMap(s => s.fields.map(f => [f.key, 0]))
)

const DailyTasks = () => {
  const pics = usePics()
  const [picId, setPicId] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState<Record<string, number>>(BLANK_ACTIVITY)
  const [notes, setNotes] = useState('')
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setTargets(res.data.data || {}) })
      .catch(() => {})
  }, [])

  // Default to the signed-in user's own PIC identity where there is one.
  useEffect(() => {
    if (picId || !pics.length) return
    api.get('/auth/me')
      .then(res => {
        const mine = res.data.data?.pic_id
        setPicId(pics.some(p => p.id === mine) ? mine : pics[0].id)
      })
      .catch(() => setPicId(pics[0].id))
  }, [pics, picId])

  // Load whatever is already recorded for this PIC/date so the form edits rather
  // than silently overwrites -- the upsert is keyed on (pic_id, entry_date).
  useEffect(() => {
    if (!picId || !entryDate) return
    setLoading(true)
    api.get('/settings/daily-activity', { params: { pic_id: picId, entry_date: entryDate } })
      .then(res => {
        const { activity, results: derived } = res.data.data || {}
        setResults(derived || {})
        if (activity) {
          setForm(Object.fromEntries(Object.keys(BLANK_ACTIVITY).map(k => [k, activity[k] ?? 0])))
          setNotes(activity.notes || '')
        } else {
          setForm(BLANK_ACTIVITY)
          setNotes('')
        }
      })
      .catch(() => toast('Could not load that day’s activity.', 'error'))
      .finally(() => setLoading(false))
  }, [picId, entryDate])

  const save = async () => {
    if (!picId) return toast('Select a PIC first.', 'error')
    setSaving(true)
    try {
      await api.post('/settings/daily-activity', { pic_id: picId, entry_date: entryDate, ...form, notes })
      toast('Daily activity saved.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save the entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async () => {
    setShowHistory(true)
    try {
      const res = await api.get('/settings/daily-activity/recent', { params: { limit: 30 } })
      setHistory(res.data.data || [])
    } catch {
      toast('Could not load previous entries.', 'error')
    }
  }

  const friendlyDate = new Date(`${entryDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="page-scroll">
      <div className="page-header" style={{ borderBottom: 'none' }}>
        <div>
          <div className="page-title">Daily Completed Tasks</div>
          <div className="page-desc">Record outreach activity completed on {friendlyDate}. These numbers feed the Outreach Dashboard and PIC Performance.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={openHistory}><Ic n={I.calendar} size={13} /> Previous Entries</Btn>
          <Btn variant="primary" sm onClick={save} disabled={saving || loading}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : "Save Today's Entry"}
          </Btn>
        </div>
      </div>
      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.title} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic n={section.icon} size={16} style={{ color: section.color }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{section.title}</span>
            </div>
            {section.fields.map(f => {
              const target = f.targetKey ? Number(targets[f.targetKey]) || 0 : 0
              const done = Number(form[f.key]) || 0
              return (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.label}</span>
                    {target > 0 && (
                      <span style={{ fontWeight: 600, color: done >= target ? 'var(--green)' : 'var(--t4)' }}>
                        {done} / {target}
                      </span>
                    )}
                  </label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] || ''}
                    placeholder="0"
                    onChange={e => setForm({ ...form, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                    style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
                  />
                </div>
              )
            })}
          </div>
        ))}

        {/* Results are counted from the pipeline itself rather than typed in, so they
            can't drift away from what actually happened in the CRM. */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Leads &amp; Conversions</div>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 14 }}>Counted automatically from this PIC's pipeline activity on this date.</div>
          {[
            { label: 'Warm Leads Generated', key: 'warm_leads' },
            { label: 'Inquiries Generated',  key: 'inquiries' },
            { label: 'Quotations Generated', key: 'quotations' },
            { label: 'Sales Generated',      key: 'sales' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{f.label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{results[f.key] ?? 0}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 18, gridColumn: '2 / 4' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>PIC &amp; Notes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Entry Date</label>
              <input className="inp" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">PIC (Person In Charge)</label>
              <select className="sel" style={{ width: '100%', height: 36 }} value={picId} onChange={e => setPicId(e.target.value)}>
                {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <textarea className="inp" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Daily notes, challenges, observations…" style={{ height: 'auto', padding: '10px 12px' }} />
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Previous Entries</div>
              <Btn variant="ghost" sm onClick={() => setShowHistory(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: 420, overflow: 'auto' }}>
              {history.length === 0 ? (
                <div className="empty"><div className="empty-title">No entries recorded yet</div><div className="empty-desc">Saved daily activity will appear here.</div></div>
              ) : (
                <table className="crm">
                  <thead><tr>
                    <th>Date</th><th>PIC</th><th className="r">Emails</th><th className="r">Calls</th><th className="r">Texts</th><th>Notes</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h: any) => (
                      <tr key={h.id} onClick={() => { setPicId(h.pic_id); setEntryDate(h.entry_date); setShowHistory(false) }}>
                        <td className="mono" style={{ fontSize: 12 }}>{h.entry_date}</td>
                        <td style={{ fontSize: 12.5, fontWeight: 600 }}>{h.pics?.name || '—'}</td>
                        <td className="r mono">{h.emails_completed}</td>
                        <td className="r mono">{h.calls_completed}</td>
                        <td className="r mono">{h.texts_completed}</td>
                        <td style={{ fontSize: 12, color: 'var(--t3)' }} className="truncate">{h.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Removed Sheet ────────────────────────────────────────────────────────────

const RemovedSheet = () => {
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [search, setSearch] = useState('')

  const detectedCount = pasteText.split('\n').map(line => line.trim()).filter(Boolean).length

  const submitPaste = async () => {
    if (!detectedCount) return
    setSubmitting(true)
    try {
      const res = await api.post('/leads/removed/bulk', { text: pasteText, reason: 'Added from Removed Sheet' })
      const matched = (res.data.data || []).filter((r: any) => r.company_name || r.contact_name).length
      toast(`${detectedCount} ${detectedCount === 1 ? 'entry' : 'entries'} suppressed — ${matched} matched an existing CRM contact.`, 'success')
      setPasteText('')
      setShowPaste(false)
      setRevision(r => r + 1)
    } catch (err: any) {
      toast(err.response?.data?.error?.message ?? 'Could not process the pasted list.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    api.get('/leads/removed').then(response => {
      if (response.data.success) setData((response.data.data || []).map((row: any) => ({
        id: row.id,
        date: new Date(row.created_at).toLocaleDateString(),
        type: row.identity_type,
        phone: row.identity_type === 'phone' ? row.normalized_value : row.contacts?.phone_direct || row.contacts?.phone_2 || '',
        email: row.identity_type === 'email' ? row.normalized_value : row.contacts?.email_active || row.contacts?.email_2 || '',
        co: row.companies?.name || '',
        contact: `${row.contacts?.first_name || ''} ${row.contacts?.last_name || ''}`.trim(),
        reason: row.reason,
        channel: row.source,
        by: row.profiles?.full_name || row.profiles?.email || 'System',
        prevStatus: 'Proceed',
        currStatus: 'Removed',
      })))
    }).catch(console.error)
  }, [revision])
  const [typeFilter, setTypeFilter] = useState<'' | 'phone' | 'email'>('')
  const filtered = data.filter(row => {
    const term = search.trim().toLowerCase()
    const typeMatch = !typeFilter || row.type === typeFilter
    const searchMatch = !term || [row.co, row.contact, row.phone, row.email, row.reason]
      .some(value => String(value || '').toLowerCase().includes(term))
    return typeMatch && searchMatch
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 20px', background: '#FFF1F2', borderBottom: '1px solid #FECDD3', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Ic n={I.warning} size={15} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9F1239' }}>All records here are excluded from call, text, and email outreach automatically.</span>
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search removed records, or reason…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="">All Types</option>
          <option value="phone">Phone Only</option>
          <option value="email">Email Only</option>
        </select>
        <div className="toolbar-right">
          <Btn variant="danger" sm onClick={() => setShowPaste(true)}><Ic n={I.plus} size={13} /> Paste Opted-Out / Bounced</Btn>
          <ExportMenu data={data} filename="removed" />
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Date</th><th>Removal Type</th><th>Phone</th><th>Email</th>
            <th>Company</th><th>Contact</th><th>Reason</th><th>Channel</th>
            <th>Prev Status</th><th>Curr Status</th><th>Added By</th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id || i} style={{ background: 'var(--red-bg)' }}>
                <td className="mono" style={{ fontSize: 12 }}>{r.date}</td>
                <td><span className="badge b-red">{r.type}</span></td>
                <td className="mono" style={{ fontSize: 12, color: r.phone ? 'var(--t2)' : 'var(--t4)' }}>{r.phone || '—'}</td>
                <td className="mono" style={{ fontSize: 12, color: r.email ? 'var(--t2)' : 'var(--t4)' }}>{r.email || '—'}</td>
                <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.co}</td>
                <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                <td style={{ fontSize: 12 }}>{r.channel}</td>
                <td><Badge status={r.prevStatus as BadgeStatus} /></td>
                <td><Badge status={r.currStatus as BadgeStatus} /></td>
                <td style={{ fontSize: 12, color: 'var(--t3)' }}>{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPaste && (
        <div className="overlay" onClick={() => setShowPaste(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Paste Opted-Out Contacts</div>
              <Btn variant="ghost" sm onClick={() => setShowPaste(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Paste phone numbers or email addresses (one per line). The system will find and update matching CRM records.</p>
              <textarea className="inp" rows={8} autoFocus value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'+1-206-555-0088\nbounce@example.com\n+1-701-555-0341'} style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }} />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'}</div>
            </div>
            <div className="modal-footer">
              <Btn variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={submitPaste} disabled={submitting || !detectedCount}>{submitting ? 'Removing…' : 'Match & Remove'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Deliverability ───────────────────────────────────────────────────────────

type RemovedMatchRow = {
  raw_value: string
  identity_type: 'email' | 'phone'
  normalized_value: string
  company_name: string | null
  contact_name: string | null
  was_new: boolean
}

const Deliverability = () => {
  const [tab, setTab] = useState('Email')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<RemovedMatchRow[]>([])
  const [error, setError] = useState('')

  const detectedCount = pasteText.split('\n').map(l => l.trim()).filter(Boolean).length

  const submitPaste = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post('/leads/removed/bulk', { text: pasteText, reason: `Bulk paste from Deliverability (${tab})` })
      setResults(res.data.data || [])
      setPasteText('')
      setShowPaste(false)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.message ?? 'Could not process the pasted list.')
    } finally {
      setSubmitting(false)
    }
  }

  const visibleResults = tab === 'Unmatched'
    ? results.filter(r => !r.company_name && !r.contact_name)
    : tab === 'Phone / SMS'
      ? results.filter(r => r.identity_type === 'phone')
      : tab === 'Email'
        ? results.filter(r => r.identity_type === 'email')
        : results

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tabs">
        {['Email', 'Phone / SMS', 'Unmatched'].map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste {tab === 'Phone / SMS' ? 'Failed Numbers' : 'Bounced Emails'}</Btn>
        <div style={{ padding: '6px 12px', background: 'var(--s2)', borderRadius: 8, fontSize: 12, color: 'var(--t3)' }}>
          Paste one email or phone number per line. Each one is matched against existing contacts and added to the shared suppression list -- it's then filtered out of every prospect/warm-lead/inquiry list automatically.
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-s)', fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>
            Processing Results {results.length > 0 && <span style={{ color: 'var(--t4)', fontWeight: 500 }}>({visibleResults.length} of {results.length})</span>}
          </div>
          <table className="crm">
            <thead><tr><th>Pasted Value</th><th>Matched Company</th><th>Contact</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {visibleResults.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 12 }}>{r.raw_value}</td>
                  <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.company_name || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                  <td style={{ fontSize: 12.5 }}>{r.contact_name || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                  <td><span className="badge b-blue">{r.identity_type}</span></td>
                  <td>
                    {r.was_new
                      ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)' }}>Added to Removed list</span>
                      : <span style={{ fontSize: 12.5, color: 'var(--t4)' }}>Already suppressed</span>}
                  </td>
                </tr>
              ))}
              {visibleResults.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>
                  {results.length === 0 ? 'Paste a list to get started.' : 'Nothing in this tab yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rules legend */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
            {tab === 'Email' ? 'Email Deliverability Rules' : 'SMS & Phone Deliverability Rules'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(tab === 'Email' ? [
              { from: 'Hard Bounce', to: 'Removed', color: 'var(--red)' },
              { from: 'Recipient Not Found', to: 'Removed', color: 'var(--red)' },
              { from: 'Unsubscribed', to: 'Removed', color: 'var(--red)' },
              { from: 'Spam Complaint', to: 'Removed', color: 'var(--red)' },
              { from: 'Soft Bounce', to: 'Mail Delivery Report + Warning', color: 'var(--amber)' },
              { from: 'Mailbox Full', to: 'Mail Delivery Report + Warning', color: 'var(--amber)' },
            ] : [
              { from: 'Opted Out', to: 'Removed', color: 'var(--red)' },
              { from: 'Invalid Number', to: 'Removed', color: 'var(--red)' },
              { from: 'Landline', to: 'Calls Only', color: 'var(--brand)' },
              { from: 'SMS Undeliverable + Calls Work', to: 'Calls Only', color: 'var(--brand)' },
              { from: 'Calls & SMS Work', to: 'Call/Text', color: 'var(--green)' },
            ]).map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: 'var(--s2)', borderRadius: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--t3)', flex: 1 }}>{rule.from}</span>
                <Ic n={I.arrowRight} size={12} style={{ color: 'var(--border)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: rule.color }}>{rule.to}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showPaste && (
        <div className="overlay" onClick={() => !submitting && setShowPaste(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Paste {tab === 'Phone / SMS' ? 'Failed Numbers' : 'Bounced Emails'}</div>
              <Btn variant="ghost" sm onClick={() => setShowPaste(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 12 }}>Paste phone numbers or email addresses (one per line). Matching CRM contacts are found automatically and added to the shared suppression list.</p>
              {error && <div style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
              <textarea
                className="inp"
                rows={8}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'+1-206-555-0088\nbounce@example.com\n+1-701-555-0341'}
                style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}
              />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'}</div>
            </div>
            <div className="modal-footer">
              <Btn variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Btn>
              <button className="btn btn-danger" disabled={submitting || detectedCount === 0} onClick={submitPaste}>
                {submitting ? 'Matching…' : 'Match & Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Container Catalog ────────────────────────────────────────────────────────

const useCatalogList = (path: string) => {
  const [data, setData] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    api.get(path).then(res => { if (res.data.success) setData(res.data.data || []) }).catch(console.error)
  }, [path])
  return data
}

const ContainerCatalog = () => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')

  return (
    <div className="page-scroll">
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 0 }}>
          <div>
            <div className="page-title">Container Catalog</div>
            <div className="page-desc">Sizes and condition grades offered on quotations and inquiries. This CRM doesn't track physical unit inventory -- pricing is set per quotation.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Available Sizes</div>
            {sizes.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {sizes.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No sizes configured.</div>}
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Condition Grades</div>
            {conditions.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <span className="badge b-green">Available</span>
              </div>
            ))}
            {conditions.length === 0 && <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No condition grades configured.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PIC Performance ─────────────────────────────────────────────────────────

const PICPerformance = () => {
  const analytics = useAnalytics();
  const PIC_DATA: PicPerformanceRow[] = analytics?.charts?.PIC_DATA || [];
  return (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 16 }}>
      <p className="greeting-title">PIC Performance</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Not a dropdown: PIC_DATA is computed server-side for the current calendar
            month only, so there's nothing to select yet. */}
        <div className="date-range" style={{ cursor: 'default' }} title="Scored on the current calendar month">
          <Ic n={I.calendar} size={13} /><span>This Month</span>
        </div>
        <ExportMenu data={PIC_DATA} filename="pic_performance" />
      </div>
    </div>
    <div className="page-content" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {PIC_DATA.map((p, i) => (
          <div key={p.name} className="kpi-featured" style={{ background: ['#2D4FE0','#6D28D9','#065F46','#92400E'][i] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{p.name}</span>
              <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: 'rgba(255,255,255,0.2)', color: 'white' }}>{p.initials}</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>${p.profit.toLocaleString()}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{p.sales} sales · {p.units} units</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="crm">
          <thead><tr>
            <th>#</th><th>PIC</th><th className="r">Calls</th><th className="r">Emails</th>
            <th className="r">Texts</th><th className="r">Warm Leads</th><th className="r">Inquiries</th>
            <th className="r">Quotes</th><th className="r">Sales</th><th className="r">Units</th>
            <th className="r">Revenue</th><th className="r">Gross Profit</th>
          </tr></thead>
          <tbody>
            {PIC_DATA.map((p, i) => (
              <tr key={p.name}>
                <td>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#FEF3C7' : 'var(--s3)', color: i === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 10, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i] }}>{p.initials}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.name}</span>
                  </div>
                </td>
                <td className="r mono">{p.calls}</td>
                <td className="r mono">{p.emails.toLocaleString()}</td>
                <td className="r mono">{p.texts}</td>
                <td className="r mono bold">{p.leads}</td>
                <td className="r mono bold">{p.inquiries}</td>
                <td className="r mono">{p.quotes}</td>
                <td className="r mono bold">{p.sales}</td>
                <td className="r mono bold">{p.units}</td>
                <td className="r revenue-cell">${p.revenue.toLocaleString()}</td>
                <td className="r profit-cell">${p.profit.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}

// ─── Profit Analytics ─────────────────────────────────────────────────────────

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

// ─── Best Clients ─────────────────────────────────────────────────────────────

const BestClients = () => {
  const [search, setSearch] = useState('')
  const customers = useCustomers('All', search)
  const ranked = [...customers].sort((a, b) => b.profit - a.profit)

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Best Clients</div>
            <div className="page-desc">Every customer, ranked by gross profit generated.</div>
          </div>
        </div>
        <div className="toolbar" style={{ padding: 0, marginBottom: 14 }}>
          <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="toolbar-right">
            <span className="count-label">{ranked.length} clients</span>
            <ExportMenu data={ranked} filename="best-clients" />
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="crm" style={{ width: '100%' }}>
            <thead><tr>
              <th style={{ width: 44 }}>#</th><th>Company</th><th>Contact</th><th>PIC</th>
              <th className="r">Sales</th><th className="r">Units</th><th className="r">Revenue</th>
              <th className="r">Gross Profit</th><th>Last Purchase</th><th>Status</th>
            </tr></thead>
            <tbody>
              {ranked.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#FEF3C7' : 'var(--s3)', color: i === 0 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  </td>
                  <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{c.co}</td>
                  <td style={{ fontSize: 12.5 }}>{c.contact}</td>
                  <td><ChipPIC label={c.pic} /></td>
                  <td className="r mono bold">{c.sales}</td>
                  <td className="r mono bold">{c.units}</td>
                  <td className="r revenue-cell">${c.revenue.toLocaleString()}</td>
                  <td className="r profit-cell">${c.profit.toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{c.last}</td>
                  <td><Badge status={c.status as BadgeStatus} /></td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>No customers with a purchase history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inquiry Funnel ───────────────────────────────────────────────────────────

// Real inquiry.status values, as actually set by the backend (see
// create_inquiry_from_warm_lead / create_quotation / convert_to_sale in the SQL migrations)
// -- not the larger aspirational status list in BadgeStatus, most of which nothing ever sets.
const INQUIRY_FUNNEL_STAGES = [
  { statuses: ['Under Review'], label: 'Under Review', color: '#315EF6' },
  { statuses: ['Quotation Created'], label: 'Quotation Created', color: '#7C3AED' },
  { statuses: ['Converted to Sale'], label: 'Converted to Sale', color: '#059669' },
]

const InquiryFunnel = () => {
  const inquiries = useInquiries(0, 'all')
  const stageCounts = INQUIRY_FUNNEL_STAGES.map(stage => ({
    ...stage,
    count: inquiries.filter(r => stage.statuses.includes(r.status)).length,
  }))
  const total = stageCounts.reduce((sum, s) => sum + s.count, 0)
  const lostCount = inquiries.filter(r => ['Lost', 'Removed'].includes(r.status)).length
  const maxCount = Math.max(1, ...stageCounts.map(s => s.count))

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Inquiry Funnel</div>
            <div className="page-desc">Where {total} tracked inquiries stand today, stage by stage.</div>
          </div>
        </div>
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stageCounts.map((s, i) => {
              const pctOfMax = (s.count / maxCount) * 100
              const pctOfTotal = total > 0 ? (s.count / total) * 100 : 0
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2)' }}>{i + 1}. {s.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{s.count} <span style={{ color: 'var(--t4)', fontWeight: 500 }}>({pctOfTotal.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 22, borderRadius: 6, background: 'var(--s2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctOfMax}%`, background: s.color, borderRadius: 6, transition: 'width 0.3s ease', minWidth: s.count > 0 ? 4 : 0 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Total Tracked Inquiries</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{total}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Converted to Sale</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{stageCounts[stageCounts.length - 1].count}</div>
          </div>
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Lost / Removed</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--mono)' }}>{lostCount}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Inquiry Validation (Procurement) ──────────────────────────────────────────

const BOARD_COLUMNS: { key: string; label: string; statuses: string[]; dot: string }[] = [
  { key: 'pending', label: 'Pending Validation', statuses: ['Pending Validation'], dot: '#D97706' },
  { key: 'review', label: 'Under Review', statuses: ['Under Review'], dot: '#315EF6' },
  { key: 'quoted', label: 'Quotation Created', statuses: ['Quotation Created'], dot: '#7C3AED' },
  { key: 'won', label: 'Converted to Sale', statuses: ['Converted to Sale'], dot: '#059669' },
  { key: 'rejected', label: 'Rejected', statuses: ['Validation Rejected', 'Quotation Rejected'], dot: '#DC2626' },
]

const useInquiryBoard = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/leads/inquiries/board').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => ({
        id: row.id,
        ref: `INQ-${row.id.slice(0, 8).toUpperCase()}`,
        date: new Date(row.created_at).toLocaleDateString(),
        status: row.status,
        company: row.companies?.name || '',
        contact: row.contacts ? `${row.contacts.first_name || ''} ${row.contacts.last_name || ''}`.trim() : '',
        pic: row.pics?.name || 'Unassigned',
        description: row.requirements || '—',
        size: row.container_sizes?.name || '—',
        condition: row.container_conditions?.name || '—',
        location: [row.state_province, row.country].filter(Boolean).join(', ') || '—',
        quantity: row.quantity ?? '—',
        price: row.asking_price != null ? Number(row.asking_price) : null,
        rejectionReason: row.rejection_reason || '',
        altSize: row.alt_size?.name || '',
        altCondition: row.alt_condition?.name || '',
        altQuantity: row.alt_quantity ?? null,
        altAskingPrice: row.alt_asking_price != null ? Number(row.alt_asking_price) : null,
        altNotes: row.alt_notes || '',
      })));
    }).catch(console.error)
  }, [revision])
  return data
}

type AlternativeOffer = {
  containerSizeId?: string
  containerConditionId?: string
  quantity?: number
  askingPrice?: number
  notes?: string
}

const RejectTicketModal = ({ ticketRef, onClose, onReject }: {
  ticketRef: string
  onClose: () => void
  onReject: (reason: string, alternative: AlternativeOffer) => Promise<void>
}) => {
  const sizes = useCatalogList('/catalog/sizes')
  const conditions = useCatalogList('/catalog/conditions')
  const [reason, setReason] = useState('')
  const [altSize, setAltSize] = useState('')
  const [altCondition, setAltCondition] = useState('')
  const [altQuantity, setAltQuantity] = useState('')
  const [altPrice, setAltPrice] = useState('')
  const [altNotes, setAltNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    await onReject(reason.trim(), {
      containerSizeId: altSize || undefined,
      containerConditionId: altCondition || undefined,
      quantity: altQuantity ? Number(altQuantity) : undefined,
      askingPrice: altPrice ? Number(altPrice) : undefined,
      notes: altNotes.trim() || undefined,
    })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Reject {ticketRef}</div>
          <Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reason (required)</label>
            <textarea className="inp" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why isn't this ticket viable as-is?" style={{ height: 'auto', padding: '8px 12px' }} />
          </div>
          <div style={{ borderTop: '1px solid var(--border-s)', paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Alternative offer (optional)</div>
            <div style={{ fontSize: 11.5, color: 'var(--t4)', marginBottom: 10 }}>Leave any field blank to keep the ticket's original value. The Sales Manager can apply this with one click.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Size</label>
                <select className="inp" value={altSize} onChange={e => setAltSize(e.target.value)}>
                  <option value="">Unchanged</option>
                  {sizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Condition</label>
                <select className="inp" value={altCondition} onChange={e => setAltCondition(e.target.value)}>
                  <option value="">Unchanged</option>
                  {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Quantity</label>
                <input className="inp" type="number" min={1} value={altQuantity} onChange={e => setAltQuantity(e.target.value)} placeholder="Unchanged" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Asking price</label>
                <input className="inp" type="number" min={0} value={altPrice} onChange={e => setAltPrice(e.target.value)} placeholder="Unchanged" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Notes</label>
              <textarea className="inp" rows={2} value={altNotes} onChange={e => setAltNotes(e.target.value)} placeholder="Any context that doesn't fit the fields above" style={{ height: 'auto', padding: '8px 12px' }} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" disabled={!reason.trim() || submitting} onClick={submit}>
            {submitting ? 'Rejecting…' : 'Reject Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TicketCard = ({ t, onView, onApprove, onReject }: {
  t: any
  onView: () => void
  onApprove?: () => void
  onReject?: () => void
}) => (
  <div className="card ticket-card" style={{ padding: 14, marginBottom: 10, cursor: 'pointer' }} onClick={onView}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <span className="ref-id" style={{ color: 'var(--teal)', fontSize: 11 }}>{t.ref}</span>
      <Badge status={t.status as BadgeStatus} />
    </div>
    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--t1)', marginBottom: 2 }}>{t.company}</div>
    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>{t.contact}</div>
    <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{t.description}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: onApprove || onReject ? 10 : 0 }}>
      <span className="badge b-gray" style={{ fontSize: 10.5 }}>{t.size}</span>
      <span className="badge b-gray" style={{ fontSize: 10.5 }}>{t.condition}</span>
      <span className="badge b-gray" style={{ fontSize: 10.5 }}>Qty {t.quantity}</span>
      {t.price != null && <span className="badge b-gray" style={{ fontSize: 10.5 }}>${t.price.toLocaleString()}</span>}
      <ChipPIC label={t.pic} />
    </div>
    {(onApprove || onReject) && (
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        {onReject && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', flex: 1 }} onClick={onReject}>Reject</button>}
        {onApprove && <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={onApprove}>Approve</button>}
      </div>
    )}
  </div>
)

const InfoBox = ({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) => (
  <div style={{ background: accent ? `${accent}0d` : 'var(--s2)', border: `1px solid ${accent ? accent + '40' : 'var(--border-s)'}`, borderRadius: 10, padding: 14 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: accent || 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{children}</div>
  </div>
)

const LiveStockWidget = ({ size, condition }: { size: string; condition: string }) => {
  const [stock, setStock] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!size || !condition || size === '—' || condition === '—') {
      setLoading(false)
      return
    }
    api.get('/inventory/stock-check', { params: { size, condition } })
      .then(res => {
        if (res.data.success) setStock(res.data.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [size, condition])

  if (loading) return <div style={{ fontSize: 11, color: 'var(--t4)', padding: 8 }}>Checking live inventory…</div>
  if (!stock) return null

  const available = stock.total_available || 0
  const isAvailable = available > 0
  const isLow = available > 0 && available <= 2

  return (
    <div style={{
      background: isAvailable ? (isLow ? '#FFFBEB' : '#ECFDF5') : '#FEF2F2',
      border: `1px solid ${isAvailable ? (isLow ? '#FDE68A' : '#A7F3D0') : '#FECACA'}`,
      borderRadius: 10, padding: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: isAvailable ? (isLow ? '#92400E' : '#065F46') : '#991B1B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Live Yard Stock Check
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
          background: isAvailable ? (isLow ? '#FEF3C7' : '#D1FAE5') : '#FEE2E2',
          color: isAvailable ? (isLow ? '#92400E' : '#065F46') : '#991B1B'
        }}>
          {isAvailable ? (isLow ? `Low Stock (${available} left)` : `In Stock (${available} units)`) : 'Out of Stock (0 units)'}
        </span>
      </div>
      {stock.depots && stock.depots.length > 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--t2)', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {stock.depots.map((d: any, idx: number) => (
            <span key={idx} style={{ background: 'rgba(255,255,255,0.7)', padding: '3px 7px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
              <strong>{d.depot}</strong>: {d.available} available ({d.reserved} reserved)
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>
          No active depot inventory matching this exact size and condition.
        </div>
      )}
    </div>
  )
}

const TicketDetailModal = ({ t, onClose, onApprove, onReject }: {
  t: any
  onClose: () => void
  onApprove?: () => void
  onReject?: () => void
}) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" style={{ width: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
      <div className="modal-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', letterSpacing: 0.3, marginBottom: 4 }}>
            {t.ref} · REQUESTED BY {(t.pic || 'UNASSIGNED').toUpperCase()}
          </div>
          <div className="modal-title" style={{ fontSize: 19, lineHeight: 1.3 }}>{t.company}</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 2 }}>{t.contact}</div>
        </div>
        <Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn>
      </div>
      <div style={{ overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <InfoBox label="Status"><Badge status={t.status as BadgeStatus} /></InfoBox>
          <InfoBox label="Location">{t.location}</InfoBox>
          <InfoBox label="Container Size">{t.size}</InfoBox>
          <InfoBox label="Condition">{t.condition}</InfoBox>
          <InfoBox label="Quantity">{t.quantity}</InfoBox>
          <InfoBox label="Asking Price">{t.price != null ? `$${t.price.toLocaleString()}` : '—'}</InfoBox>
        </div>

        <LiveStockWidget size={t.size} condition={t.condition} />

        <div style={{ background: 'var(--s2)', border: '1px solid var(--border-s)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            <Ic n={I.calendar} size={12} /> Ticket Timeline
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div style={{ fontSize: 10.5, color: 'var(--t4)', marginBottom: 2 }}>Received</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{t.date}</div></div>
            <div><div style={{ fontSize: 10.5, color: 'var(--t4)', marginBottom: 2 }}>Status</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{t.status}</div></div>
          </div>
        </div>

        <div style={{ background: 'var(--s2)', border: '1px solid var(--border-s)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Description</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{t.description}</div>
        </div>

        {t.rejectionReason && (
          <InfoBox label="Rejection Reason" accent="var(--red)">
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t.rejectionReason}</span>
          </InfoBox>
        )}

        {(t.altSize || t.altCondition || t.altAskingPrice != null || t.altNotes) && (
          <div style={{ background: 'var(--amber-bg, #FFFBEB)', border: '1px solid var(--amber)40', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Alternative Offer</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: t.altNotes ? 8 : 0 }}>
              {t.altSize && <span className="badge b-amber">{t.altSize}</span>}
              {t.altCondition && <span className="badge b-amber">{t.altCondition}</span>}
              {t.altAskingPrice != null && <span className="badge b-amber">${t.altAskingPrice.toLocaleString()}</span>}
            </div>
            {t.altNotes && <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.5 }}>{t.altNotes}</div>}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        {onReject && <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={onReject}>Reject</button>}
        {onApprove && <button className="btn btn-primary" onClick={onApprove}>Approve</button>}
      </div>
    </div>
  </div>
)

const InquiryValidation = () => {
  const [revision, setRevision] = useState(0)
  const tickets = useInquiryBoard(revision)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState('')

  const pics = [...new Set(tickets.map((t: any) => t.pic).filter(Boolean))].sort() as string[]
  const term = search.trim().toLowerCase()
  const filtered = tickets.filter((t: any) =>
    (!picFilter || t.pic === picFilter) &&
    (!term || [t.company, t.contact, t.ref].some(v => String(v).toLowerCase().includes(term)))
  )

  const approve = async (id: string) => {
    setError('')
    try {
      await api.post(`/leads/inquiries/${id}/validate`, { approved: true })
      setViewingId(null)
      setRevision(v => v + 1)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Could not approve this ticket.')
    }
  }

  const reject = async (id: string, reason: string, alternative: AlternativeOffer) => {
    setError('')
    try {
      await api.post(`/leads/inquiries/${id}/validate`, {
        approved: false,
        rejectionReason: reason,
        altContainerSizeId: alternative.containerSizeId,
        altContainerConditionId: alternative.containerConditionId,
        altQuantity: alternative.quantity,
        altAskingPrice: alternative.askingPrice,
        altNotes: alternative.notes,
      })
      setRejectingId(null)
      setViewingId(null)
      setRevision(v => v + 1)
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Could not reject this ticket.')
    }
  }

  const rejectingTicket = tickets.find((t: any) => t.id === rejectingId)
  const viewingTicket = tickets.find((t: any) => t.id === viewingId)
  const pendingCount = tickets.filter((t: any) => t.status === 'Pending Validation').length
  const rejectedCount = tickets.filter((t: any) => ['Validation Rejected', 'Quotation Rejected'].includes(t.status)).length
  const wonCount = tickets.filter((t: any) => t.status === 'Converted to Sale').length

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 16 }}>
          <div>
            <div className="page-title">Inquiry Validation</div>
            <div className="page-desc">Every inquiry a Sales Manager creates lands here as a ticket before it can be quoted. Approve it, or reject it with a reason and an optional alternative.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total Tickets', val: tickets.length, icon: I.inquiry, color: '#315EF6' },
            { label: 'Pending Validation', val: pendingCount, icon: I.warning, color: '#D97706' },
            { label: 'Converted to Sale', val: wonCount, icon: I.check, color: '#059669' },
            { label: 'Rejected', val: rejectedCount, icon: I.x, color: '#DC2626' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: `${k.color}15`, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ic n={k.icon} size={17} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>{k.val}</div>
                <div style={{ fontSize: 11.5, color: 'var(--t4)' }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ padding: 0, marginBottom: 14 }}>
          <select className="sel" value={picFilter} onChange={e => setPicFilter(e.target.value)}><option value="">All PICs</option>{pics.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search tickets, company, contact…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="toolbar-right">
            <span className="count-label">Showing {filtered.length} of {tickets.length} tickets</span>
          </div>
        </div>

        {error && <div style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {BOARD_COLUMNS.map(col => {
            const colTickets = filtered.filter((t: any) => col.statuses.includes(t.status))
            return (
              <div key={col.key} style={{ minWidth: 260, width: 260, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, padding: '0 2px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)' }}>{col.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--t4)', marginLeft: 'auto' }}>{colTickets.length}</span>
                </div>
                <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 2 }}>
                  {colTickets.map((t: any) => (
                    <TicketCard
                      key={t.id}
                      t={t}
                      onView={() => setViewingId(t.id)}
                      onApprove={col.key === 'pending' ? () => approve(t.id) : undefined}
                      onReject={col.key === 'pending' ? () => setRejectingId(t.id) : undefined}
                    />
                  ))}
                  {colTickets.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--t4)', fontSize: 11.5 }}>No tickets</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {viewingTicket && (
        <TicketDetailModal
          t={viewingTicket}
          onClose={() => setViewingId(null)}
          onApprove={viewingTicket.status === 'Pending Validation' ? () => approve(viewingTicket.id) : undefined}
          onReject={viewingTicket.status === 'Pending Validation' ? () => setRejectingId(viewingTicket.id) : undefined}
        />
      )}
      {rejectingTicket && (
        <RejectTicketModal
          ticketRef={rejectingTicket.ref}
          onClose={() => setRejectingId(null)}
          onReject={(reason, alternative) => reject(rejectingTicket.id, reason, alternative)}
        />
      )}
    </div>
  )
}

// ─── Inventory Management ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'In Stock':     { bg: '#D1FAE5', color: '#065F46' },
  'Low Stock':    { bg: '#FEF3C7', color: '#92400E' },
  'Out of Stock': { bg: '#FEE2E2', color: '#991B1B' },
  'Reserved':     { bg: '#EDE9FE', color: '#4C1D95' },
}

const InventoryManagement = ({ role }: { role?: string }) => {
  const [search, setSearch]             = useState('')
  const [sizeFilter, setSizeFilter]     = useState('')
  const [condFilter, setCondFilter]     = useState('')
  const [depotFilter, setDepotFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [revision, setRevision]         = useState(0)
  const [showNew, setShowNew]           = useState(false)
  const [showPaste, setShowPaste]       = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [editRow, setEditRow]           = useState<any>(null)
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState('')

  const filters: Record<string, string> = {}
  if (search)       filters.search              = search
  if (sizeFilter)   filters.container_size      = sizeFilter
  if (condFilter)   filters.container_condition = condFilter
  if (depotFilter)  filters.depot_name          = depotFilter
  if (statusFilter) filters.status              = statusFilter

  const inventory = useInventory(filters, revision)
  const summary   = useInventorySummary(revision)
  const canWrite  = ['admin', 'procurement', 'operations'].includes(role ?? '')
  const refresh   = () => setRevision(r => r + 1)

  const sizes  = [...new Set(inventory.map((r: any) => r.container_size))].filter(Boolean).sort() as string[]
  const conds  = [...new Set(inventory.map((r: any) => r.container_condition))].filter(Boolean).sort() as string[]
  const depots = [...new Set(inventory.map((r: any) => r.depot_name))].filter(Boolean).sort() as string[]

  const handleStockDelta = async (id: string, field: 'available' | 'reserved', delta: number) => {
    try {
      await api.patch(`/inventory/${id}/stock`, {
        delta_available: field === 'available' ? delta : 0,
        delta_reserved:  field === 'reserved'  ? delta : 0,
      })
      refresh()
    } catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to adjust stock', 'error') }
  }

  const handleDelete = async (id: string) => {
    const { confirmed } = await askConfirm({
      title: 'Delete inventory record',
      message: 'Delete this inventory record? This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    try { await api.delete(`/inventory/${id}`); refresh() }
    catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to delete', 'error') }
  }

  // ── New / Edit form ──────────────────────────────────────────────────────
  const InventoryForm = ({ initial, onClose }: { initial?: any; onClose: () => void }) => {
    const isEdit = !!initial?.id
    const [form, setForm] = useState({
      container_size: initial?.container_size || '', container_condition: initial?.container_condition || '',
      container_category: initial?.container_category || 'Dry', vendor_supplier: initial?.vendor_supplier || '',
      depot_name: initial?.depot_name || '', city: initial?.city || '',
      state_province: initial?.state_province || '', country: initial?.country || 'USA',
      quantity_available: initial?.quantity_available ?? 0, quantity_reserved: initial?.quantity_reserved ?? 0,
      unit_cost: initial?.unit_cost ?? 0, target_sell_price: initial?.target_sell_price ?? 0, notes: initial?.notes || '',
    })
    const set = (k: string) => (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value }))
    // Reuse the same container_sizes/container_conditions/container_categories catalog that
    // Inquiries and Quotations already draw from -- the "Live Stock Check" widget on a ticket
    // matches by exact name against this catalog, so inventory has to speak the same
    // vocabulary or that lookup silently never finds a match.
    const SZ = useCatalogList('/catalog/sizes').map(s => s.name)
    const CD = useCatalogList('/catalog/conditions').map(c => c.name)
    const CT = useCatalogList('/catalog/categories').map(c => c.name)
    const handleSubmit = async () => {
      if (!form.container_size || !form.container_condition || !form.depot_name) { setFormError('Size, condition, and depot are required.'); return }
      setSaving(true); setFormError('')
      try {
        const payload = { ...form, quantity_available: Number(form.quantity_available), quantity_reserved: Number(form.quantity_reserved), unit_cost: Number(form.unit_cost), target_sell_price: Number(form.target_sell_price) }
        isEdit ? await api.patch(`/inventory/${initial.id}`, payload) : await api.post('/inventory', payload)
        refresh(); onClose()
      } catch (e: any) { setFormError(e?.response?.data?.error?.message || 'Failed to save') }
      finally { setSaving(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">{isEdit ? 'Edit Inventory Record' : 'Add Inventory'}</div><Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {formError && <div style={{ gridColumn:'1/-1', color:'#DC2626', fontSize:12, padding:'8px 12px', background:'#FEF2F2', borderRadius:7 }}>{formError}</div>}
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Container Size *</label><select className="inp" value={form.container_size} onChange={set('container_size')}><option value="">— Select —</option>{SZ.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><label className="form-label">Condition *</label><select className="inp" value={form.container_condition} onChange={set('container_condition')}><option value="">— Select —</option>{CD.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label className="form-label">Category</label><select className="inp" value={form.container_category} onChange={set('container_category')}>{CT.map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Depot / Yard Name *</label><input className="inp" placeholder="e.g. Long Beach Depot A" value={form.depot_name} onChange={set('depot_name')} /></div>
            <div><label className="form-label">Vendor / Supplier</label><input className="inp" placeholder="e.g. Maersk Surplus" value={form.vendor_supplier} onChange={set('vendor_supplier')} /></div>
            <div><label className="form-label">City</label><input className="inp" value={form.city} onChange={set('city')} /></div>
            <div><label className="form-label">State / Province</label><input className="inp" value={form.state_province} onChange={set('state_province')} /></div>
            <div><label className="form-label">Country</label><input className="inp" value={form.country} onChange={set('country')} /></div>
            <div><label className="form-label">Units Available</label><input className="inp" type="number" min={0} value={form.quantity_available} onChange={set('quantity_available')} /></div>
            <div><label className="form-label">Units Reserved</label><input className="inp" type="number" min={0} value={form.quantity_reserved} onChange={set('quantity_reserved')} /></div>
            <div><label className="form-label">Unit Cost ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.unit_cost} onChange={set('unit_cost')} /></div>
            <div><label className="form-label">Target Sell Price ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.target_sell_price} onChange={set('target_sell_price')} /></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="inp" rows={2} style={{ resize:'vertical' }} value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Inventory'}</button></div>
        </div>
      </div>
    )
  }

  // ── Paste Bulk Modal ─────────────────────────────────────────────────────
  const PasteBulkModal = ({ onClose }: { onClose: () => void }) => {
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMNS = ['container_size','container_condition','depot_name','vendor_supplier','city','state_province','country','quantity_available','unit_cost','target_sell_price']
    const parseText = (raw: string) => raw.trim().split('\n').filter(l=>l.trim()).map(line => {
      const cols = line.split('\t'); const row: any = {}
      COLUMNS.forEach((col, i) => { if (cols[i]) row[col] = cols[i].trim() }); return row
    })
    const rows = parseText(text)
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Paste Bulk from Excel</div><Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)', marginBottom:4 }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626' }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <p style={{ fontSize:12.5, color:'var(--t3)', marginBottom:8 }}>Copy rows from Excel and paste below. Columns (tab-separated):</p>
                <div style={{ fontSize:10.5, fontFamily:'var(--mono)', background:'var(--s3)', padding:'6px 10px', borderRadius:6, marginBottom:12, color:'var(--t3)', wordBreak:'break-all' }}>
                  size | condition | depot | vendor | city | state | country | qty | cost | sell_price
                </div>
                <textarea className="inp" rows={8} style={{ fontFamily:'var(--mono)', fontSize:11, resize:'vertical' }} placeholder="Paste Excel rows here…" value={text} onChange={e => setText(e.target.value)} />
                {rows.length > 0 && <div style={{ fontSize:11, color:'var(--t4)', marginTop:6 }}>{rows.length} rows detected · Preview: {rows[0]?.container_size} | {rows[0]?.depot_name}</div>}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && <button className="btn btn-primary" disabled={!text.trim() || importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  // ── Excel Import Modal ───────────────────────────────────────────────────
  const ExcelImportModal = ({ onClose }: { onClose: () => void }) => {
    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMN_MAP: Record<string, string> = {
      'container size':'container_size','size':'container_size','condition':'container_condition','container condition':'container_condition',
      'depot':'depot_name','depot name':'depot_name','yard':'depot_name','vendor':'vendor_supplier','supplier':'vendor_supplier',
      'city':'city','state':'state_province','state/province':'state_province','country':'country',
      'quantity':'quantity_available','qty':'quantity_available','available':'quantity_available',
      'unit cost':'unit_cost','cost':'unit_cost','buying cost':'unit_cost','sell price':'target_sell_price','target price':'target_sell_price','notes':'notes',
    }
    const handleFile = async (f: File) => {
      setFile(f)
      const XLSX = await import('xlsx')
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type:'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval:'' })
      const mapped = raw.map(row => {
        const out: any = {}
        Object.entries(row).forEach(([k,v]) => { const mk = COLUMN_MAP[k.toLowerCase().trim()]; if (mk) out[mk] = String(v).trim() })
        return out
      }).filter(r => r.container_size || r.depot_name)
      setRows(mapped)
    }
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 600, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Import Excel / CSV</div><Btn variant="ghost" sm onClick={onClose}><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)' }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <div style={{ border:'2px dashed var(--border)', borderRadius:10, padding:32, textAlign:'center', cursor:'pointer', marginBottom:16 }}
                  onClick={() => document.getElementById('inv-file-input')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
                  <Ic n={I.upload} size={24} style={{ color:'var(--t4)', marginBottom:8 }} />
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t2)' }}>{file ? file.name : 'Drop .xlsx or .csv here, or click to browse'}</div>
                  <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>Columns are auto-detected from the header row</div>
                  <input id="inv-file-input" type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                </div>
                {rows.length > 0 && (
                  <div style={{ fontSize:11, fontFamily:'var(--mono)', background:'var(--s3)', borderRadius:6, padding:8 }}>
                    <div style={{ fontWeight:600, color:'var(--t4)', marginBottom:4 }}>{rows.length} rows detected — preview:</div>
                    {rows.slice(0,3).map((row,i) => <div key={i} style={{ padding:'2px 0', borderBottom:'1px solid var(--border-s)' }}>{row.container_size} | {row.container_condition} | {row.depot_name} | Qty: {row.quantity_available||0}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && rows.length > 0 && <button className="btn btn-primary" disabled={importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-scroll">
      {showNew    && <InventoryForm onClose={() => { setShowNew(false); setFormError('') }} />}
      {editRow    && <InventoryForm initial={editRow} onClose={() => { setEditRow(null); setFormError('') }} />}
      {showPaste  && <PasteBulkModal onClose={() => setShowPaste(false)} />}
      {showImport && <ExcelImportModal onClose={() => setShowImport(false)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Inventory Management</div>
          <div className="page-desc">Track container stock across all depots and vendors.</div>
        </div>
        {canWrite && (
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" sm onClick={() => setShowImport(true)}><Ic n={I.upload} size={13} /> Import Excel</Btn>
            <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>
            <Btn variant="primary" sm onClick={() => setShowNew(true)}><Ic n={I.plus} size={13} /> Add Inventory</Btn>
          </div>
        )}
      </div>

      <div style={{ padding:'0 24px 16px', display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12 }}>
        {[
          { label:'Total Records',   val: summary?.total_records    ?? 0, color:'var(--t1)' },
          { label:'Units Available', val: summary?.total_available  ?? 0, color:'var(--green)' },
          { label:'Units Reserved',  val: summary?.total_reserved   ?? 0, color:'var(--amber)' },
          { label:'Active Depots',   val: summary?.active_depots    ?? 0, color:'var(--brand)' },
          { label:'Low / Out Stock', val: `${summary?.low_stock_count ?? 0} / ${summary?.out_of_stock_count ?? 0}`, color:'#DC2626' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search size, condition, depot, vendor…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={sizeFilter}   onChange={e => setSizeFilter(e.target.value)}><option value="">All Sizes</option>{sizes.map(s=><option key={s}>{s}</option>)}</select>
        <select className="sel" value={condFilter}   onChange={e => setCondFilter(e.target.value)}><option value="">All Conditions</option>{conds.map(c=><option key={c}>{c}</option>)}</select>
        <select className="sel" value={depotFilter}  onChange={e => setDepotFilter(e.target.value)}><option value="">All Depots</option>{depots.map(d=><option key={d}>{d}</option>)}</select>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option><option>Reserved</option></select>
        <div className="toolbar-right">
          <span className="count-label">{inventory.length} records</span>
          <ExportMenu data={inventory} filename="inventory" />
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 24px' }}>
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="crm">
            <thead><tr>
              <th>Container Spec</th><th>Condition</th><th>Depot / Yard</th><th>Vendor</th>
              <th className="r">Available</th><th className="r">Reserved</th>
              <th className="r">Unit Cost</th><th className="r">Target Price</th>
              <th>Status</th>{canWrite && <th>Actions</th>}
            </tr></thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={canWrite ? 10 : 9} style={{ textAlign:'center', padding:40, color:'var(--t4)' }}>
                  No inventory records found.{canWrite ? ' Click "Add Inventory" or import a vendor sheet to get started.' : ''}
                </td></tr>
              ) : inventory.map((row: any) => {
                const sc = STATUS_COLORS[row.status] || { bg:'var(--s3)', color:'var(--t3)' }
                return (
                  <tr key={row.id}>
                    <td><div style={{ fontWeight:600, fontSize:13 }}>{row.container_size}</div><div style={{ fontSize:11, color:'var(--t4)' }}>{row.container_category}</div></td>
                    <td style={{ fontSize:12.5 }}>{row.container_condition}</td>
                    <td><div style={{ fontWeight:500, fontSize:13 }}>{row.depot_name}</div>{(row.city||row.state_province) && <div style={{ fontSize:11, color:'var(--t4)' }}>{[row.city,row.state_province,row.country].filter(Boolean).join(', ')}</div>}</td>
                    <td style={{ fontSize:12.5, color:'var(--t3)' }}>{row.vendor_supplier||'—'}</td>
                    <td className="r">
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',-1)}>−</button>}
                        <span style={{ fontWeight:700, fontFamily:'var(--mono)', minWidth:24, textAlign:'center' }}>{row.quantity_available}</span>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',1)}>+</button>}
                      </div>
                    </td>
                    <td className="r mono">{row.quantity_reserved}</td>
                    <td className="r mono">${Number(row.unit_cost).toLocaleString()}</td>
                    <td className="r mono">${Number(row.target_sell_price||0).toLocaleString()}</td>
                    <td><span style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600, background:sc.bg, color:sc.color }}>{row.status}</span></td>
                    {canWrite && <td><div style={{ display:'flex', gap:4 }}><Btn variant="ghost" sm title="Edit" onClick={() => setEditRow(row)}><Ic n={I.edit} size={13} /></Btn>{role==='admin' && <Btn variant="ghost" sm title="Delete" onClick={() => handleDelete(row.id)}><Ic n={I.removed} size={13} /></Btn>}</div></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

const money = (n: any) => `$${Math.round(Number(n) || 0).toLocaleString()}`
const num = (n: any) => (Number(n) || 0).toLocaleString()

// Shapes the report into the flat tables used by every export format, so the
// Excel workbook, the Google Sheet and the on-screen document never drift apart.
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

  // PDF goes through the browser's own print-to-PDF. The .report-sheet print
  // stylesheet hides the app chrome so the output is just the document.
  const exportPDF = () => window.print()

  if (loading) return <div className="loading-row"><span className="spinner" />Building report…</div>
  if (!report) return <div className="empty"><div className="empty-title">No report available</div></div>

  const s = report.summary || {}, p = report.pipeline || {}, o = report.outreach || {}, t = report.targets || {}
  const profitTarget = Number(t.monthly_gross_profit_target) || 0
  const profitPct = profitTarget > 0 ? Math.round((Number(s.gross_profit) / profitTarget) * 100) : null
  const change = s.profit_change_pct

  const exportOptions = [
    { label: 'PDF (print)',   run: exportPDF },
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

// ─── Admin pages ──────────────────────────────────────────────────────────────

const TARGET_FIELDS: { key: string; label: string; section: string }[] = [
  { key: 'monthly_gross_profit_target', label: 'Monthly Gross Profit Target ($)', section: 'Monthly Targets' },
  { key: 'working_days_per_month',      label: 'Working Days per Month',          section: 'Monthly Targets' },
  { key: 'daily_email_target',          label: 'Daily Email Target',              section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_min',       label: 'Daily Call Target (Minimum)',     section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_preferred', label: 'Daily Call Target (Preferred)',   section: 'Daily Outreach Targets' },
  { key: 'daily_text_target',           label: 'Daily Text Target',               section: 'Daily Outreach Targets' },
]

const DailyTargets = () => {
  const [form, setForm] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setForm(res.data.data || {}) })
      .catch(() => toast('Could not load targets.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload = Object.fromEntries(TARGET_FIELDS.map(f => [f.key, Number(form[f.key]) || 0]))
      const res = await api.patch('/settings/targets', payload)
      setForm(res.data.data || form)
      toast('Targets saved. Dashboards will use these going forward.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save targets.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading targets…</div>

  let lastSection = ''
  return (
    <div className="page-scroll">
      <div className="page-content" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="page-title">Daily Targets Configuration</div>
          <div className="page-desc">Set the outreach and profit targets used across dashboards and reports.</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {TARGET_FIELDS.map(f => {
            const header = f.section !== lastSection ? (lastSection = f.section) : null
            return (
              <div key={f.key}>
                {header && <div className="form-section">{header}</div>}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">{f.label}</label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] ?? 0}
                    onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  />
                </div>
              </div>
            )
          })}
          <Btn variant="primary" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
            <Ic n={I.check} size={14} /> {saving ? 'Saving…' : 'Save Targets'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

type Territory = { id: string; region: string; name: string; enabled: boolean }

const ServiceTerritories = () => {
  const [rows, setRows] = useState<Territory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/territories')
      .then(res => { if (res.data.success) setRows(res.data.data || []) })
      .catch(() => toast('Could not load territories.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patch('/settings/territories', {
        territories: rows.map(r => ({ id: r.id, enabled: r.enabled })),
      })
      setRows(res.data.data || rows)
      toast('Service territories updated.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save territories.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading territories…</div>

  const regions = [...new Set(rows.map(r => r.region))]
  const palette: Record<string, { color: string; bg: string }> = {
    'Northern United States': { color: 'var(--brand)', bg: 'var(--brand-bg)' },
    'Canadian Provinces':     { color: 'var(--green)', bg: 'var(--green-bg)' },
  }

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Service Territory Settings</div>
            <div className="page-desc">Click a state or province to enable or disable it, then save.</div>
          </div>
          <Btn variant="primary" sm onClick={save} disabled={saving}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {regions.map(region => {
            const tone = palette[region] ?? { color: 'var(--purple)', bg: 'var(--purple-bg)' }
            const inRegion = rows.filter(r => r.region === region)
            return (
              <div key={region} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{region}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{inRegion.filter(r => r.enabled).length} of {inRegion.length} active</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {inRegion.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid transparent',
                        background: t.enabled ? tone.bg : 'var(--s3)',
                        color: t.enabled ? tone.color : 'var(--t4)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                        textDecoration: t.enabled ? 'none' : 'line-through',
                      }}
                    >
                      {t.enabled ? '✓' : '○'} {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type GoogleConnectionStatus = {
  configured: boolean
  connected: boolean
  email: string | null
}

const SystemSettings = ({ onNav }: { onNav?: (s: Screen) => void }) => {
  const analytics = useAnalytics()
  const PIC_DATA: PicPerformanceRow[] = analytics?.charts?.PIC_DATA || []
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [callbackStatus] = useState(() => new URLSearchParams(window.location.search).get('google_sync'))

  const loadGoogleStatus = useCallback(async () => {
    try {
      const response = await api.get('/auth/google/status')
      setGoogleStatus(response.data.data)
      setGoogleError('')
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to load the Gmail connection status.')
    }
  }, [])

  useEffect(() => {
    loadGoogleStatus()
    if (callbackStatus) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [callbackStatus, loadGoogleStatus])

  const connectGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError('')
    try {
      const response = await api.get('/auth/google')
      window.location.assign(response.data.data.url)
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to start Google authorization.')
      setGoogleBusy(false)
    }
  }

  const disconnectGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError('')
    try {
      await api.delete('/auth/google')
      await loadGoogleStatus()
    } catch (error: any) {
      setGoogleError(error.response?.data?.error?.message || 'Unable to disconnect the Google account.')
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
  <div className="page-scroll">
    <div className="page-content" style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">System Settings</div>
        <div className="page-desc">Integrations, numbering formats, and system configuration.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Integrations */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Integrations</div>
          {callbackStatus === 'success' && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 12 }}>
              Gmail connected successfully.
            </div>
          )}
          {callbackStatus === 'cancelled' && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--amber-bg)', color: 'var(--amber-text)', fontSize: 12 }}>
              Google authorization was cancelled.
            </div>
          )}
          {googleError && (
            <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 12 }}>
              {googleError}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-s)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
              <Ic n={I.mail} size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Gmail Outreach</div>
              <div style={{ fontSize: 12, color: 'var(--t4)' }}>
                {!googleStatus
                  ? 'Checking connection...'
                  : !googleStatus.configured
                    ? 'Google OAuth credentials are not configured on the backend.'
                    : googleStatus.connected
                      ? `Connected as ${googleStatus.email}`
                      : 'Connect a Google account to send approved prospect outreach.'}
              </div>
            </div>
            {googleStatus?.connected ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={googleBusy} onClick={disconnectGoogle}>Disconnect</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" disabled={googleBusy || !googleStatus?.configured} onClick={connectGoogle}>
                {googleBusy ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
          {[
            { name: 'Google Sheets API', status: 'Planned', desc: 'Bidirectional synchronization is not implemented yet', color: 'var(--t4)' },
            { name: 'RingCentral', status: 'Planned', desc: 'Phone and SMS integration is not implemented yet', color: 'var(--t4)' },
            { name: 'Excel / CSV Import', status: 'Available', desc: 'Manual import via upload or paste', color: 'var(--brand)' },
          ].map(i => (
            <div key={i.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${i.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i.color }}>
                <Ic n={I.sync} size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i.name}</div>
                <div style={{ fontSize: 12, color: 'var(--t4)' }}>{i.desc}</div>
              </div>
              <span className={`badge ${i.status === 'Connected' ? 'b-green' : 'b-blue'}`}>{i.status}</span>
            </div>
          ))}
        </div>

        {/* Sales Reps */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Top Sales Representatives</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>By profit this month. Manage PIC identities and roles in User Management.</div>
            </div>
            <Btn variant="primary" sm onClick={() => onNav?.('user-management')}><Ic n={I.plus} size={13} /> Manage PICs</Btn>
          </div>
          {PIC_DATA.map((p, i) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div className="avatar" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 12, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i % 4], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i % 4] }}>{p.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{p.sales} sales · ${p.profit.toLocaleString()} profit this month</div>
              </div>
            </div>
          ))}
          {PIC_DATA.length === 0 && (
            <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--t4)', textAlign: 'center' }}>No sales recorded yet this period.</div>
          )}
        </div>
      </div>
    </div>
  </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).has('google_sync') ? 'system-settings' : 'dashboard'
  )
  const [sidebarPinned, setSidebarPinnedState] = useState<boolean>(() => {
    const stored = localStorage.getItem('sidebarMode')
    return stored ? stored === 'expanded' : true
  })
  const setSidebarPinned = (pinned: boolean) => {
    localStorage.setItem('sidebarMode', pinned ? 'expanded' : 'collapsed')
    setSidebarPinnedState(pinned)
  }
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const [session, setSession] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<{ role?: string } | null>(null)

  useEffect(() => {
    if (!session) { setCurrentProfile(null); return }
    api.get('/auth/me').then(res => {
      const p = res.data.data
      setCurrentProfile(p)
      if (p?.role === 'operations') {
        setScreen(s => s === 'dashboard' ? 'pickups' : s)
      } else if (p?.role === 'procurement') {
        setScreen(s => s === 'dashboard' ? 'inquiry-validation' : s)
      }
    }).catch(console.error)
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
      setAuthChecking(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Clicking a "reset password" email link redirects back here with a temporary session
      // and this event -- show the set-new-password screen instead of dropping the user
      // straight into the app on whatever page they land on.
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleNav = useCallback((s: Screen) => setScreen(s), [])

  if (authChecking) return null;
  if (isPasswordRecovery) return <><ResetPassword onDone={() => setIsPasswordRecovery(false)} /><ToastHost /></>;
  if (!session) return <><Login onLogin={() => {}} /><ToastHost /></>;

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':           return <Dashboard onNav={handleNav} session={session} />
      case 'outreach-dashboard':  return <OutreachDashboard />
      case 'inquiry-dashboard':   return <InquiryDashboard />
      case 'prospects':           return <ProspectSheet mode="prospect" onNav={handleNav} />
      case 'warm-leads':          return <ProspectSheet mode="warm" onNav={handleNav} />
      case 'inquiries':           return <InquiryList />
      case 'quotations':          return <QuotationList />
      case 'sales-tracker':       return <SalesTracker />
      case 'customers':           return <CustomerAccounts />
      case 'contact-outreach':    return <ContactOutreach />
      case 'contracts':           return <Contracts />
      case 'daily-tasks':         return <DailyTasks />
      case 'removed':             return <RemovedSheet />
      case 'deliverability':      return <Deliverability />
      case 'container-catalog':   return <ContainerCatalog />
      case 'pic-performance':     return <PICPerformance />
      case 'profit-analytics':    return <ProfitAnalytics />
      case 'daily-targets':       return <DailyTargets />
      case 'service-territories': return <ServiceTerritories />
      case 'system-settings':     return <SystemSettings onNav={handleNav} />
      case 'profile-settings':    return <UserProfileSettings session={session} />
      case 'user-management':     return currentProfile?.role === 'admin' ? <UserManagement /> : <Dashboard onNav={handleNav} session={session} />
      case 'inquiry-validation':  return ['admin', 'procurement'].includes(currentProfile?.role ?? '') ? <InquiryValidation /> : <Dashboard onNav={handleNav} session={session} />
      case 'inventory-management': return <InventoryManagement role={currentProfile?.role} />
      case 'pickups':             return <Pickups />
      case 'best-clients':        return <BestClients />
      case 'inquiry-funnel':      return <InquiryFunnel />
      case 'monthly-report':     return <MonthlyReport />
      default:                    return <Dashboard onNav={handleNav} session={session} />
    }
  }

  // Pinned = always expanded. Unpinned = collapsed rail that peeks open on hover,
  // so users still get quick access without needing a click every time.
  const isSidebarExpanded = sidebarPinned || isHoveringSidebar

  return (
    <div data-theme={isDark ? 'dark' : undefined} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>

      {/* Physical spacer for layout so it doesn't push when hovering */}
      <div style={{
        width: sidebarPinned ? 240 : 68,
        minWidth: sidebarPinned ? 240 : 68,
        flexShrink: 0,
        transition: 'width 0.2s ease, min-width 0.2s ease'
      }} />

      {/* Floating Sidebar */}
      <div
        onMouseEnter={() => setIsHoveringSidebar(true)}
        onMouseLeave={() => setIsHoveringSidebar(false)}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 90, display: 'flex' }}
      >
        <Sidebar
          active={screen}
          onNav={handleNav}
          expanded={isSidebarExpanded}
          pinned={sidebarPinned}
          onTogglePin={() => setSidebarPinned(!sidebarPinned)}
          role={currentProfile?.role}
        />
      </div>

      <div className="workspace" style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <div className="ws-card">
          <TopBar isDark={isDark} onToggleDark={() => setIsDark(d => !d)} session={session} onNav={handleNav} role={currentProfile?.role} />
          {renderScreen()}
        </div>
      </div>
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}

// ─── Pickup Tracking ──────────────────────────────────────────────────────────

const Pickups = () => {
  const [pickStatus, setPickStatus] = useState('All Pickup Statuses');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const contracts = useContracts('All Statuses', pickStatus, search, revision);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/contracts/${id}`, { pickup_status: newStatus });
      setRevision(r => r + 1);
    } catch (err) {
      console.error(err);
      toast('Failed to update status', 'error');
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
          <span className="count-label">{contracts.length} pickups</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th>Contract #</th><th>Company</th><th>Container</th><th className="r">Qty</th>
            <th>Target Date</th><th>Status</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
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
                <td className="mono" style={{ fontSize: 12, color: c.pickStatus === 'Overdue' ? 'var(--red)' : undefined }}>{c.pickup}</td>
                <td>
                  <span className={`badge ${c.pickStatus === 'Picked Up' ? 'b-green' : c.pickStatus === 'Overdue' ? 'b-red' : c.pickStatus === 'Confirmed' ? 'b-brand' : 'b-amber'}`}>
                    {c.pickStatus}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--t2)' }}>{c.pic}</td>
                <td className="col-actions">
                  <select 
                    className="sel" 
                    value={c.pickStatus} 
                    onChange={e => handleUpdateStatus(c.id, e.target.value)}
                    style={{ padding: '4px 8px', fontSize: 11, minWidth: 110 }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Picked Up">Picked Up</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
