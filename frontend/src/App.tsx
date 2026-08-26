import { useState, useCallback, useEffect } from 'react'
import { supabase } from './config/supabase'
import { api } from './lib/api'
import Login from './Login'
import ProspectImportDialog from './features/import/ProspectImportDialog'
import { ManualWarmLeadDialog, ManualInquiryDialog } from './features/pipeline/ManualAddDialogs'
import {
  NewInquiryDialog,
  QuotationDialog,
  SaleDialog,
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

const useInquiries = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    api.get('/leads/inquiries', { params: { limit: 500 } }).then(res => {
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
          category: row.requirements || 'To be qualified',
          size: row.container_sizes?.name || '—',
          condition: row.container_conditions?.name || '—',
          qty: row.quantity ?? '—',
          neededBy: row.needed_by_date ? new Date(row.needed_by_date).toLocaleDateString() : '—',
          status: row.status || 'Under Review',
          pic: row.pics?.name || 'Unassigned',
        }
      }))
    }).catch(console.error)
  }, [revision])
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

const useProspects = (revision = 0) => {
  const [prospects, setProspects] = useState<any[]>([]);
  useEffect(() => {
    api.get('/leads/prospects', { params: { limit: 500 } }).then(res => {
      const data = (res.data.data || []).map(mapPipelineRow);
      setProspects(data);
    }).catch(e => console.error("Failed to fetch API data", e));
  }, [revision]);
  return prospects;
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
  | 'service-territories' | 'daily-targets' | 'system-settings'

// ─── Navigation ──────────────────────────────────────────────────────────────

type NavItem = { id: Screen; label: string; icon: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Executive Overview', icon: I.dashboard },
      { id: 'outreach-dashboard', label: 'Outreach Dashboard', icon: I.target },
      { id: 'inquiry-dashboard', label: 'Inquiry Dashboard', icon: I.inquiry },
    ],
  },
  {
    label: 'Sales Core',
    items: [
      { id: 'prospects', label: 'Prospect Clients', icon: I.prospect },
      { id: 'warm-leads', label: 'Warm Leads', icon: I.lead },
      { id: 'inquiries', label: 'Inquiries', icon: I.inquiry },
      { id: 'quotations', label: 'Quotations', icon: I.quote },
      { id: 'sales-tracker', label: 'Sales Tracker', icon: I.sales },
    ],
  },
  {
    label: 'Customers',
    items: [
      { id: 'customers', label: 'Customer Accounts', icon: I.customer },
      { id: 'contact-outreach', label: 'Contact Outreach', icon: I.outreach },
      { id: 'contracts', label: 'Contracts', icon: I.contract },
      { id: 'pickups', label: 'Pickup Tracking', icon: I.pickup },
    ],
  },
  {
    label: 'Outreach & Data',
    items: [
      { id: 'daily-tasks', label: 'Daily Tasks', icon: I.tasks },
      { id: 'removed', label: 'Removed Sheet', icon: I.removed },
      { id: 'deliverability', label: 'Deliverability', icon: I.deliverabil },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { id: 'container-catalog', label: 'Container Catalog', icon: I.container },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'pic-performance', label: 'PIC Performance', icon: I.analytics },
      { id: 'best-clients', label: 'Best Clients', icon: I.flag },
      { id: 'profit-analytics', label: 'Profit Analytics', icon: I.profit },
      { id: 'inquiry-funnel', label: 'Inquiry Funnel', icon: I.inquiry },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { id: 'service-territories', label: 'Service Territories', icon: I.map },
      { id: 'daily-targets', label: 'Daily Targets', icon: I.target },
      { id: 'system-settings', label: 'System Settings', icon: I.config },
    ],
  },
]

const COLLAPSED_NAV_ITEMS = new Set<Screen>([
  'dashboard',
  'prospects',
  'warm-leads',
  'inquiries',
  'quotations',
  'sales-tracker',
])

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
  'service-territories': 'Service Territories',
  'daily-targets': 'Daily Targets',
  'system-settings': 'System Settings',
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
type BestClientRow = { r: number; co: string; u: number; p: number }
type OverduePickupRow = { contract: string; co: string; days: number; qty: number; size: string }
type LossReasonRow = { reason: string; color: string; count: number }

const profitChartData: ProfitChartPoint[] = []
const categoryData: ChartSlice[] = []
const inquiryStatusData: ChartSlice[] = []
const PIC_DATA: PicPerformanceRow[] = []
const BEST_CLIENTS: BestClientRow[] = []
const OVERDUE_PICKUPS: OverduePickupRow[] = []
const LOSS_REASONS: LossReasonRow[] = []

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

const BADGE_MAP: Record<string, string> = {
  'Proceed': 'b-green', 'Active': 'b-green', 'Completed': 'b-green', 'Accepted': 'b-green',
  'Converted to Sale': 'b-green', 'Converted': 'b-green', 'Picked Up': 'b-green',
  'Removed': 'b-red', 'Lost': 'b-red', 'Rejected': 'b-red', 'Overdue': 'b-red', 'Cancelled': 'b-red',
  'Pending': 'b-amber', 'Awaiting Response': 'b-amber', 'Under Review': 'b-amber',
  'New Inquiry': 'b-blue', 'Draft': 'b-blue', 'Call/Text': 'b-green',
  'Calls Only': 'b-blue', 'Mail Delivery Report': 'b-blue', 'Scheduled': 'b-blue', 'Confirmed': 'b-blue', 'Sent': 'b-blue',
  'Text Only': 'b-purple', 'Negotiating': 'b-purple', 'Negotiation': 'b-purple',
  'Quotation Required': 'b-amber', 'Quotation Sent': 'b-teal',
}

const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${BADGE_MAP[status] || 'b-gray'}`}>{status}</span>
)

const Trend = ({ val, up, white }: { val: string; up: boolean; white?: boolean }) => (
  <span className={`trend ${white ? 'trend-up-white' : up ? 'trend-up' : 'trend-down'}`}>
    {up ? '↑' : '↓'} {val}
  </span>
)

const Prog = ({ pct, color = '#315EF6', tall }: { pct: number; color?: string; tall?: boolean }) => (
  <div className={`prog${tall ? ' tall' : ''}`}>
    <div className="prog-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
  </div>
)

const Divider = () => <div className="divider" />

const Btn = ({ children, variant = 'secondary', sm, className = '', onClick, style }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  sm?: boolean; className?: string; onClick?: React.MouseEventHandler<HTMLButtonElement>; style?: React.CSSProperties
}) => (
  <button
    className={`btn btn-${variant}${sm ? ' btn-sm' : ''} ${className}`}
    onClick={onClick} style={style}
  >{children}</button>
)

const EligDot = ({ on }: { on: boolean }) => (
  <div className="elig-dot" style={{ background: on ? '#059669' : '#E5E7EB' }} />
)

const ChipPIC = ({ label }: { label: string }) => (
  <span style={{ background: 'var(--brand-bg)', color: 'var(--brand)', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{label}</span>
)

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar = ({ active, onNav, expanded, mode, onModeChange }: {
  active: Screen; onNav: (s: Screen) => void; expanded: boolean;
  mode: 'expanded' | 'collapsed' | 'hover'; onModeChange: (m: 'expanded' | 'collapsed' | 'hover') => void;
}) => {
  const visibleGroups = expanded
    ? NAV
    : NAV
        .map(group => ({
          ...group,
          items: group.items.filter(item => COLLAPSED_NAV_ITEMS.has(item.id)),
        }))
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
          className={`sb-item${active === 'system-settings' ? ' active' : ''}`}
          data-tooltip="System Settings"
          title={expanded ? undefined : 'System Settings'}
          aria-current={active === 'system-settings' ? 'page' : undefined}
          onClick={() => onNav('system-settings')}
        >
          <div className="sb-icon-wrap">
            <Ic n={I.config} size={16} style={{ color: 'var(--sb-icon)' }} />
          </div>
          <span className="sb-item-label">Settings</span>
        </button>
        <button
          type="button"
          className="sb-item"
          data-tooltip="Toggle Navigation Mode"
          title={expanded ? undefined : 'Toggle Navigation Mode'}
          onClick={() => {
             if (mode === 'expanded') onModeChange('collapsed');
             else if (mode === 'collapsed') onModeChange('hover');
             else onModeChange('expanded');
          }}
        >
          <div className="sb-icon-wrap">
            <Ic n={mode === 'expanded' ? I.chevLeft : mode === 'hover' ? I.chevRight : I.menu} size={16} style={{ color: 'var(--sb-icon)' }} />
          </div>
          {expanded && (
            <div style={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sb-item-label" style={{ fontWeight: 600 }}>Nav Mode</span>
              <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600, background: 'rgba(49, 94, 246, 0.15)', padding: '2px 6px', borderRadius: 4 }}>
                {mode === 'expanded' ? 'Pinned' : mode === 'hover' ? 'Hover' : 'Collapsed'}
              </span>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

const TopBar = ({ isDark, onToggleDark }: { isDark: boolean; onToggleDark: () => void }) => {
  return (
    <header className="topbar">
      <div className="search-wrap">
        <Ic n={I.search} size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)' }} />
        <input placeholder="Search prospects, leads, inquiries, sales…" />
      </div>

      <div className="topbar-right">
        <div className="sync-pill">
          <Ic n={I.sync} size={11} />
          Synced 2m ago
        </div>

        
        <button className="tb-btn" onClick={() => supabase.auth.signOut()} title="Logout" style={{ color: 'var(--red)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>

        <button className="tb-btn" onClick={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'}>
          <Ic n={isDark ? I.sun : I.moon} size={16} />
        </button>

        <button className="tb-btn" style={{ position: 'relative' }}>
          <Ic n={I.bell} size={17} />
          <span className="notif-dot" />
        </button>

        <button className="tb-btn">
          <Ic n={I.calendar} size={17} />
        </button>

        <div className="avatar-btn">
          <div className="avatar">JC</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.2 }}>James Carter</span>
            <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>Sales Manager</span>
          </div>
          <Ic n={I.chevDown} size={12} style={{ color: 'var(--t4)', marginLeft: 2 }} />
        </div>
      </div>
    </header>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = ({ onNav }: { onNav: (s: Screen) => void }) => {
  const [chartMetric, setChartMetric] = useState<'profit' | 'revenue' | 'cost'>('profit')
  const chartColor = chartMetric === 'profit' ? '#315EF6' : chartMetric === 'revenue' ? '#059669' : '#6B7280'
  const analytics = useAnalytics()
  const m = analytics?.metrics || {}
  const funnel = analytics?.funnel || {}
  const conversion = (value: number, previous: number) => previous > 0 ? `${Math.round((value / previous) * 100)}%` : '0%'

  return (
    <div className="page-scroll">
      {/* Greeting */}
      <div className="greeting-bar">
        <div>
          <p className="greeting-title">Good morning, James 👋</p>
          <p className="greeting-sub">Here's what's happening across your sales pipeline this month.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="date-range">
            <Ic n={I.calendar} size={13} />
            <span>This month</span>
            <Ic n={I.chevDown} size={12} />
          </div>
          <Btn variant="ghost" sm onClick={() => exportToCSV([], 'dashboard')}><Ic n={I.export} size={13} /> Export</Btn>
        </div>
      </div>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Row 1: KPIs + Chart ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 2fr', gap: 12, alignItems: 'stretch' }}>
          {/* Featured KPI */}
          <div className="kpi-featured" style={{ background: 'linear-gradient(145deg, #2D4FE0 0%, #4C6FFF 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>Monthly Gross Profit</span>
              <button style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic n={I.arrowRight} size={13} />
              </button>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginBottom: 6 }}>${m.total_gross_profit?.toLocaleString() || 0}</div>
              <Trend val="0" up white />
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>Target: $0 · 0%</div>
              <div style={{ marginTop: 10, height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '0%', background: 'rgba(255,255,255,0.8)', borderRadius: 99 }} />
              </div>
            </div>
          </div>

          {/* Secondary KPIs stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Monthly Revenue</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>${m.total_revenue?.toLocaleString() || 0}</div>
              <Trend val="0" up />
              <div className="kpi-sub">vs last month</div>
            </div>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Units Sold</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.total_units || 0}</div>
              <Trend val="0" up />
              <div className="kpi-sub">containers this month</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Active Clients</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.active_clients || 0}</div>
              <Trend val="0" up />
              <div className="kpi-sub">purchased in last 90 days</div>
            </div>
            <div className="kpi-card" style={{ flex: 1 }}>
              <div className="kpi-label">Profit Margin</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{m.profit_margin?.toFixed(1) || 0}%</div>
              <Trend val="0" up />
              <div className="kpi-sub">vs last month average</div>
            </div>
          </div>

          {/* Main chart */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Gross Profit Performance</div>
                <div className="chart-sub">Monthly trend — all PICs combined</div>
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
              { label: 'Prospects', count: funnel.prospects || 0, pct: '100%', change: 'active', up: true, screen: 'prospects' as Screen, color: '#315EF6' },
              { label: 'Warm Leads', count: funnel.warm_leads || 0, pct: conversion(funnel.warm_leads || 0, funnel.prospects || 0), change: 'active', up: true, screen: 'warm-leads' as Screen, color: '#7C3AED' },
              { label: 'Inquiries', count: funnel.inquiries || 0, pct: conversion(funnel.inquiries || 0, funnel.warm_leads || 0), change: 'active', up: true, screen: 'inquiries' as Screen, color: '#D97706' },
              { label: 'Quotations', count: funnel.quotations || 0, pct: conversion(funnel.quotations || 0, funnel.inquiries || 0), change: 'active', up: true, screen: 'quotations' as Screen, color: '#EA580C' },
              { label: 'Sales', count: funnel.sales || 0, pct: conversion(funnel.sales || 0, funnel.quotations || 0), change: 'won', up: true, screen: 'sales-tracker' as Screen, color: '#059669' },
            ].map((s, i) => (
              <div key={s.label} className="pipeline-stage" onClick={() => onNav(s.screen)}>
                {i > 0 && (
                  <div className="ps-arrow" style={{ color: 'var(--border)' }}>›</div>
                )}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 15, fontWeight: 800 }}>{s.count}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{s.pct} conversion</div>
                <Trend val={s.change} up={s.up} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 3: Outreach + Donut charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {/* Outreach progress */}
          <div className="chart-card">
            <div className="chart-title">Outreach Progress — Today</div>
            <div className="chart-sub">Daily targets vs completed</div>
            {[
              { label: 'Emails', done: 375, target: 500, color: '#315EF6' },
              { label: 'Calls', done: 12, target: 15, color: '#0D9488' },
              { label: 'Texts / SMS', done: 220, target: 300, color: '#7C3AED' },
            ].map(o => (
              <div key={o.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--t2)' }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{o.done}</span> / {o.target}
                  </span>
                </div>
                <Prog pct={(o.done / o.target) * 100} color={o.color} tall />
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
            <div className="chart-sub">This month · units</div>
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
                {BEST_CLIENTS.map(row => (
                  <tr key={row.r}>
                    <td style={{ width: 36 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: row.r === 1 ? '#FEF3C7' : 'var(--s3)', color: row.r === 1 ? '#D97706' : 'var(--t4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{row.r}</span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{row.co}</td>
                    <td className="r mono" style={{ fontWeight: 700 }}>{row.u}</td>
                    <td className="r profit-cell">${row.p.toLocaleString()}</td>
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
                  <Ic n={I.warning} size={13} style={{ color: 'var(--red)' }} />
                  Overdue Pickups
                </div>
                <div className="chart-sub" style={{ marginBottom: 0 }}>Requires immediate action</div>
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
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>
                2 overdue · Total delay risk on 4 containers
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
  const emailDone = 0, emailTarget = 0
  const callsDone = 0, callsMin = 0, callsPref = 0
  const textsDone = 0, textsTarget = 0
  const profitDone = 0, profitTarget = 0

  return (
    <div className="page-scroll">
      <div className="greeting-bar">
        <div>
          <p className="greeting-title">Outreach Dashboard</p>
          <p className="greeting-sub">Daily targets, outreach completion, and profit progress — Monday, Jul 29</p>
        </div>
        <div className="date-range"><Ic n={I.calendar} size={13} /><span>Today</span><Ic n={I.chevDown} size={12} /></div>
      </div>
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Monthly profit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="kpi-featured" style={{ background: 'linear-gradient(145deg,#059669,#10B981)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>Monthly Gross Profit</span>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 5 }}>${profitDone.toLocaleString()}</div>
              <Trend val="0" up white />
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Target: ${profitTarget.toLocaleString()} · {Math.round(profitDone/profitTarget*100)}%</div>
              <div style={{ marginTop: 10, height: 5, background: 'rgba(255,255,255,0.25)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(profitDone/profitTarget*100)}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 99 }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>Remaining: ${(profitTarget-profitDone).toLocaleString()}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Projected Month-End</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--green)' }}>$48,200</div>
            <div className="kpi-sub">Based on current daily pace</div>
            <span className="badge b-green" style={{ marginTop: 8 }}>96% of target</span>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Units Sold — Month</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>0</div>
            <Trend val="0" up /><div className="kpi-sub">vs last month</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Eligible Contacts</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>286</div>
            <div className="kpi-sub">For email, call, or text</div>
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>24 excluded (Removed)</div>
          </div>
        </div>

        {/* Daily targets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            {
              label: 'Email Target', icon: I.mail, color: '#315EF6', done: emailDone, target: emailTarget,
              details: [
                { k: 'Remaining', v: emailTarget - emailDone, color: 'var(--amber)' },
                { k: 'Completion', v: `${Math.round(emailDone/emailTarget*100)}%`, color: 'var(--brand)' },
                { k: 'Valid Available', v: 0, color: 'var(--green)' },
                { k: 'Excluded', v: 0, color: 'var(--red)' },
              ],
              status: 'On Track', statusCls: 'b-blue',
            },
            {
              label: 'Call Target', icon: I.phone, color: '#0D9488', done: callsDone, target: callsPref,
              details: [
                { k: 'Answered', v: 0, color: 'var(--green)' },
                { k: 'No Answer', v: 0, color: 'var(--amber)' },
                { k: '→ Inquiry', v: 0, color: 'var(--brand)' },
                { k: '→ Sale', v: 0, color: 'var(--green)' },
              ],
              status: 'Min Achieved', statusCls: 'b-green',
            },
            {
              label: 'Text / SMS Target', icon: I.inquiry, color: '#7C3AED', done: textsDone, target: textsTarget,
              details: [
                { k: 'Remaining', v: textsTarget - textsDone, color: 'var(--amber)' },
                { k: 'Replies', v: 0, color: 'var(--green)' },
                { k: '→ Warm Leads', v: 0, color: 'var(--brand)' },
                { k: '→ Inquiries', v: 0, color: 'var(--purple)' },
              ],
              status: 'Nearly Complete', statusCls: 'b-teal',
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Combined Outreach Summary — Today</span>
          </div>
          <table className="crm">
            <thead><tr><th>Channel</th><th>Target</th><th className="r">Completed</th><th className="r">Remaining</th><th>Progress</th><th>Status</th></tr></thead>
            <tbody>
              {[
                { ch: 'Email', target: '500', done: 375, rem: 125, pct: 75, status: 'On Track', cls: 'b-blue' },
                { ch: 'Calls', target: '10 min · 15 pref', done: 12, rem: 3, pct: 80, status: 'Min Achieved', cls: 'b-green' },
                { ch: 'Texts (SMS)', target: '300 declared', done: 220, rem: 80, pct: 73, status: 'Nearly Complete', cls: 'b-teal' },
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

const InquiryDashboard = () => (
  <div className="page-scroll">
    <div className="greeting-bar">
      <p className="greeting-title">Inquiry Dashboard</p>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Inquiries', val: '0', trend: '0%', up: true },
          { label: 'Need Quotation', val: '0', trend: '0', up: true },
          { label: 'Awaiting Response', val: '0', trend: '0', up: false },
          { label: 'Converted', val: '0', trend: '0%', up: true },
          { label: 'Lost', val: '0', trend: '0', up: false },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 26 }}>{k.val}</div>
            <Trend val={k.trend} up={k.up} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="chart-card">
          <div className="chart-title">Inquiry Conversion Funnel</div>
          <div className="chart-sub" style={{ marginBottom: 14 }}>This month</div>
          {[
            { label: 'Total Inquiries', v: 0, pct: 0, color: '#315EF6' },
            { label: 'Quotation Requested', v: 0, pct: 0, color: '#7C3AED' },
            { label: 'Quotation Sent', v: 0, pct: 0, color: '#0D9488' },
            { label: 'Negotiating', v: 0, pct: 0, color: '#D97706' },
            { label: 'Converted to Sale', v: 0, pct: 0, color: '#059669' },
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
)

// ─── Prospect / Warm Lead Sheet ───────────────────────────────────────────────

const ProspectSheet = ({ mode = 'prospect', onNav }: { mode?: 'prospect' | 'warm'; onNav?: (s: Screen) => void }) => {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [missingContactOnly, setMissingContactOnly] = useState(false)
  const [view, setView] = useState('grid')
  const [tab, setTab] = useState('Standard A–Q View')

  const [revision, setRevision] = useState(0)
  const [importMode, setImportMode] = useState<'file' | 'paste' | null>(null)

  const _prospectsData = useProspects(revision)
  const _warmData = useWarmLeads(revision)
  const prospectsData = mode === 'warm' ? _warmData : _prospectsData

  const handleConvert = async (id: string) => {
    try {
      await api.post(`/leads/prospects/${id}/convert-to-warm-lead`);
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      alert(e.response?.data?.error?.message ?? 'Conversion failed.')
    }
  }

  const handleCreateInquiry = async (id: string) => {
    try {
      await api.post(`/leads/warm-leads/${id}/create-inquiry`, {});
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      alert(e.response?.data?.error?.message ?? 'Inquiry creation failed.')
    }
  }

  const handleRemove = async (id: string) => {
    const reason = window.prompt('Why should this contact be removed from active CRM lists?')?.trim()
    if (!reason) return
    try {
      await api.post(`/leads/${mode === 'prospect' ? 'prospect' : 'warm_lead'}/${id}/remove`, { reason })
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      alert(e.response?.data?.error?.message ?? 'Removal failed.')
    }
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
          {mode === 'prospect' && <Btn variant="secondary" sm onClick={() => setImportMode('paste')}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>}
          {mode === 'warm' && <Btn variant="primary" sm onClick={() => setImportMode('manual')}><Ic n={I.plus} size={13} /> Add Warm Lead</Btn>}
          <Btn variant="ghost" sm onClick={() => exportToCSV(filtered, 'pipeline_data')}><Ic n={I.export} size={13} /> Export</Btn>
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

        {selected.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--brand-bg)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
            {selected.length} selected
            <Btn variant="ghost" sm>Assign PIC</Btn>
            <Btn variant="ghost" sm>Change Category</Btn>
            {mode === 'prospect'
              ? <Btn variant="ghost" sm onClick={() => Promise.all(selected.map(handleConvert))}>→ Warm Lead</Btn>
              : <Btn variant="ghost" sm onClick={() => Promise.all(selected.map(handleCreateInquiry))}>Create Inquiry</Btn>
            }
          </div>
        )}

        <div className="toolbar-right">
          <span className="count-label">{filtered.length} records</span>
          <Btn variant="ghost" sm><Ic n={I.phone} size={13} /> Copy for RingCentral</Btn>
          {['⊞', '☰'].map((ic, i) => (
            <button key={i} className={`btn btn-ghost btn-sm btn-icon${view === (i === 0 ? 'grid' : 'table') ? '' : ''}`}
              onClick={() => setView(i === 0 ? 'grid' : 'table')}>{ic}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['Standard A–Q View', 'Address Prep A–U View', 'Compact Outreach View'].map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {/* Spreadsheet table */}
      <div className="table-wrap">
        <div style={{ minWidth: 'max-content' }}>
          {/* Column header row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 5, background: 'var(--s2)', borderBottom: '2px solid var(--border)' }}>
            {/* Row num + checkbox */}
            <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', background: 'var(--s2)', position: 'sticky', left: 0, zIndex: 6 }}>
              <input type="checkbox" className="cb" onChange={e => setSelected(e.target.checked ? filtered.map(r => r.id) : [])} />
            </div>
            {COLS.map(col => (
              <div key={col.key} style={{ minWidth: col.w, width: col.w, padding: '7px 12px', borderRight: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span className="col-header-letter">{col.key}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 2, height: 'auto', minHeight: 0, color: 'var(--brand)' }} title={`Copy all ${col.label}`} onClick={(e) => {
                  e.stopPropagation();
                  const dataToCopy = filtered.map(r => getVal(r, col.field)).filter(Boolean).join('\n');
                  navigator.clipboard.writeText(dataToCopy);
                  alert(`Copied ${filtered.map(r => getVal(r, col.field)).filter(Boolean).length} items to clipboard!`);
                }}>
                  <Ic n={I.copy} size={11} />
                </button>
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
                {COLS.map(col => {
                  const val = getVal(row, col.field)
                  return (
                    <div key={col.key} style={{ minWidth: col.w, width: col.w, padding: '0 12px', height: 38, display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-s)', overflow: 'hidden' }}>
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
                    : <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={(e) => { e.stopPropagation(); handleCreateInquiry(row.id); }}>Inquiry</Btn>
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
          {['Compact', 'Standard', 'Comfortable'].map(d => (
            <button key={d} className="btn btn-ghost btn-xs" style={{ fontWeight: d === 'Standard' ? 600 : 400, color: d === 'Standard' ? 'var(--brand)' : undefined }}>{d}</button>
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
    </div>
  )
}

// ─── Inquiry List ─────────────────────────────────────────────────────────────

const InquiryList = () => {
  const [revision, setRevision] = useState(0)
  const [showNewInquiry, setShowNewInquiry] = useState<'manual' | 'existing' | false>(false)
  const [quotationInquiryId, setQuotationInquiryId] = useState<string | null>(null)
  const INQUIRIES = useInquiries(revision)
  const warmLeads = useWarmLeads(revision)
  const [tab, setTab] = useState('All')
  const [lookup, setLookup] = useState('')
  const tabs = ['All', 'New', 'Quotation Required', 'Awaiting Response', 'Negotiating', 'Converted', 'Lost']

  const filtered = INQUIRIES.filter(r => {
    const tabMatch = tab === 'All' || r.status === tab || (tab === 'Converted' && r.status === 'Converted to Sale')
    const term = lookup.trim().toLowerCase()
    return tabMatch && (!term || [r.company, r.contact, r.ref, r.category].some(value => String(value).toLowerCase().includes(term)))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showNewInquiry === 'manual' && (
        <ManualInquiryDialog
          onClose={() => setShowNewInquiry(false)}
          onSuccess={() => { setShowNewInquiry(false); setRevision(value => value + 1); }}
        />
      )}
      {showNewInquiry === 'existing' && (
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
          <input className="inp sm" placeholder="Enter phone number or email address…" value={lookup} onChange={e => setLookup(e.target.value)} style={{ flex: 1 }} />
          <Btn variant="primary" sm><Ic n={I.search} size={13} /> Lookup</Btn>
          <Btn variant="secondary" sm onClick={() => setShowNewInquiry('existing')}><Ic n={I.plus} size={13} /> From Warm Lead</Btn>
          <Btn variant="primary" sm onClick={() => setShowNewInquiry('manual')}><Ic n={I.plus} size={13} /> Add Manual Inquiry</Btn>
        </div>
      </div>

      {/* Status cards */}
      <div className="status-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          { label: 'New Inquiries', val: INQUIRIES.filter(r => ['New', 'Under Review'].includes(r.status)).length, color: '#315EF6' },
          { label: 'Need Quotation', val: INQUIRIES.filter(r => r.status === 'Quotation Required').length, color: '#D97706' },
          { label: 'Awaiting Response', val: INQUIRIES.filter(r => r.status === 'Awaiting Response').length, color: '#7C3AED' },
          { label: 'Negotiating', val: INQUIRIES.filter(r => r.status === 'Negotiating').length, color: '#EA580C' },
          { label: 'Converted', val: INQUIRIES.filter(r => ['Converted', 'Converted to Sale'].includes(r.status)).length, color: '#059669' },
        ].map(s => (
          <div key={s.label} className="status-card" style={{ background: s.color }}>
            <div className="sc-label">{s.label}</div>
            <div className="sc-value">{s.val}</div>
            <div className="sc-trend">↑ this month</div>
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
        <select className="sel"><option>All Channels</option><option>Phone</option><option>Email</option><option>SMS</option></select>
        <select className="sel"><option>All PICs</option></select>
        <div className="toolbar-right">
          <span className="count-label">{filtered.length} inquiries</span>
          <Btn variant="ghost" sm onClick={() => exportToCSV(filtered, 'inquiries')}><Ic n={I.export} size={13} /> Export</Btn>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="crm">
          <thead>
            <tr>
              <th className="col-check"><input type="checkbox" className="cb" /></th>
              <th>Inquiry #</th><th>Date / Time</th><th>Channel</th>
              <th><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>Company
                <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 2, height: 'auto', minHeight: 0, color: 'var(--brand)' }} onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(filtered.map(r => r.company).filter(Boolean).join('\n'));
                  alert(`Copied ${filtered.map(r => r.company).filter(Boolean).length} companies!`);
                }}><Ic n={I.copy} size={11} /></button>
              </div></th>
              <th><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>Contact
                <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 2, height: 'auto', minHeight: 0, color: 'var(--brand)' }} onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(filtered.map(r => r.contact).filter(Boolean).join('\n'));
                  alert(`Copied ${filtered.map(r => r.contact).filter(Boolean).length} contacts!`);
                }}><Ic n={I.copy} size={11} /></button>
              </div></th>
              <th>Category</th><th>Size</th><th className="r">Qty</th><th>Needed By</th><th>Status</th><th>PIC</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.ref}>
                <td className="col-check"><input type="checkbox" className="cb" /></td>
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
                    <Btn variant="ghost" sm>View</Btn>
                    <Btn variant="ghost" sm style={{ color: 'var(--purple)' }} onClick={() => setQuotationInquiryId(row.id)}>→ Quote</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Quotation List ───────────────────────────────────────────────────────────

const QuotationList = () => {
  const [revision, setRevision] = useState(0)
  const [showQuotation, setShowQuotation] = useState(false)
  const [saleQuotationId, setSaleQuotationId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const quotes = useQuotations(revision)
  const inquiries = useInquiries(revision)

  const acceptQuotation = async (id: string) => {
    setActionError('')
    try {
      await api.patch(`/deals/quotations/${id}/status`, { status: 'Accepted' })
      setRevision(value => value + 1)
    } catch (error: any) {
      setActionError(error.response?.data?.error?.message ?? error.message ?? 'Could not accept the quotation.')
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
      <div className="status-strip" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {[
          { label: 'Draft', val: quotes.filter(q => q.status === 'Draft').length, color: '#6B7280' },
          { label: 'Sent', val: quotes.filter(q => q.status === 'Sent').length, color: '#315EF6' },
          { label: 'Viewed', val: quotes.filter(q => q.status === 'Viewed').length, color: '#7C3AED' },
          { label: 'Accepted', val: quotes.filter(q => q.status === 'Accepted').length, color: '#059669' },
          { label: 'Rejected', val: quotes.filter(q => q.status === 'Rejected').length, color: '#DC2626' },
          { label: 'Converted', val: quotes.filter(q => q.status === 'Converted').length, color: '#0D9488' },
        ].map(s => (
          <div key={s.label} className="status-card" style={{ background: s.color }}>
            <div className="sc-label">{s.label}</div><div className="sc-value">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search quotations…" /></div>
        <select className="sel"><option>All Statuses</option></select>
        <select className="sel"><option>All PICs</option></select>
        <div className="toolbar-right">
          <Btn variant="ghost" sm onClick={() => exportToCSV(quotes, 'quotations')}><Ic n={I.export} size={13} /> Export</Btn>
          <Btn variant="primary" sm onClick={() => setShowQuotation(true)}><Ic n={I.plus} size={13} /> Create Quotation</Btn>
        </div>
      </div>
      {actionError && <div style={{ margin: '0 20px 10px', padding: 9, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" /></th>
            <th>Quote #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th className="r">Qty</th><th className="r">Total Sell</th><th className="r">Est. Profit</th>
            <th className="r">Margin</th><th>Status</th><th>Source</th><th>PIC</th><th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.ref}>
                <td className="col-check"><input type="checkbox" className="cb" /></td>
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
                    <Btn variant="ghost" sm>View</Btn>
                    {['Draft', 'Sent', 'Viewed'].includes(q.status) && <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => acceptQuotation(q.id)}>Accept</Btn>}
                    {q.status === 'Accepted' && <Btn variant="ghost" sm style={{ color: 'var(--green)' }} onClick={() => setSaleQuotationId(q.id)}>→ Sale</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sales Tracker ────────────────────────────────────────────────────────────

const SalesTracker = () => {
  const [revision, setRevision] = useState(0)
  const [showSale, setShowSale] = useState(false)
  const SALES = useSales(revision)
  const quotations = useQuotations(revision)
  const totalBuy = SALES.reduce((s, r) => s + r.totalBuy, 0)
  const totalSell = SALES.reduce((s, r) => s + r.totalSell, 0)
  const totalProfit = SALES.reduce((s, r) => s + r.profit, 0)
  const totalUnits = SALES.reduce((s, r) => s + r.qty, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showSale && (
        <SaleDialog
          quotations={quotations as QuotationOption[]}
          onClose={() => setShowSale(false)}
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
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search sales…" /></div>
        <select className="sel"><option>All PICs</option></select>
        <select className="sel"><option>All Categories</option></select>
        <select className="sel"><option>This Month</option><option>Last Month</option><option>All Time</option></select>
        <div className="toolbar-right">
          <Btn variant="ghost" sm onClick={() => exportToCSV(SALES, 'sales')}><Ic n={I.export} size={13} /> Export</Btn>
          <Btn variant="primary" sm onClick={() => setShowSale(true)}><Ic n={I.plus} size={13} /> Record Sale</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" /></th>
            <th>Sale #</th><th>Date</th><th>Company</th><th>Category</th><th>Size</th>
            <th>Condition</th><th className="r">Qty</th><th className="r">Buy/Unit</th>
            <th className="r">Sell/Unit</th><th className="r">Total Buy</th><th className="r">Total Sell</th>
            <th className="r">Profit</th><th className="r">Margin</th><th>PIC</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {SALES.map(s => (
              <tr key={s.ref}>
                <td className="col-check"><input type="checkbox" className="cb" /></td>
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
                  <div className="row-actions"><Btn variant="ghost" sm>View</Btn></div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--s2)' }}>
              <td colSpan={7} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>Totals ({SALES.length} sales)</td>
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
    </div>
  )
}

// ─── Customer Accounts ────────────────────────────────────────────────────────

const CustomerAccounts = () => {
  const [tab, setTab] = useState('All')
  const customers = [
    { co: 'NorthStar Construction LLC', contact: 'Tom Erikson', phone: '+1-612-555-0182', state: 'MN', country: 'USA', sales: 22, units: 28, revenue: 182400, profit: 56800, last: 'Jul 28', pic: 'JC', status: 'Active' },
    { co: 'Great Lakes Storage Solutions', contact: 'Ryan Murphy', phone: '+1-313-555-0447', state: 'MI', country: 'USA', sales: 18, units: 22, revenue: 134800, profit: 42200, last: 'Jul 25', pic: 'MS', status: 'Active' },
    { co: 'Ontario Modular Structures', contact: 'Pierre Leclerc', phone: '+1-416-555-0229', state: 'ON', country: 'CAN', sales: 14, units: 18, revenue: 112800, profit: 34600, last: 'Jul 16', pic: 'DL', status: 'Active' },
    { co: 'Rockies Build Ltd', contact: 'Derek Holt', phone: '+1-403-555-0318', state: 'AB', country: 'CAN', sales: 11, units: 14, revenue: 88600, profit: 26400, last: 'Jul 22', pic: 'DL', status: 'Active' },
    { co: 'Bakken Industrial LLC', contact: 'Mark Jensen', phone: '+1-701-555-0512', state: 'ND', country: 'USA', sales: 8, units: 11, revenue: 72400, profit: 21800, last: 'Jun 30', pic: 'JC', status: 'Floating' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Accounts</div>
          <div className="page-desc">Companies with confirmed purchase history.</div>
        </div>
        <Btn variant="primary" sm><Ic n={I.plus} size={13} /> Add Customer</Btn>
      </div>
      <div className="tabs">
        {['All', 'Active', 'Floating'].map(t => <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search customers…" /></div>
        <select className="sel"><option>All Countries</option><option>USA</option><option>Canada</option></select>
        <select className="sel"><option>All PICs</option></select>
        <div className="toolbar-right">
          <span className="count-label">{customers.length} customers</span>
          <Btn variant="ghost" sm onClick={() => exportToCSV(customers, 'customers')}><Ic n={I.export} size={13} /> Export</Btn>
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" /></th>
            <th>Company</th><th>Contact</th><th>State</th><th>PIC</th>
            <th className="r">Sales</th><th className="r">Units</th><th className="r">Revenue</th>
            <th className="r">Gross Profit</th><th>Last Purchase</th><th>Status</th>
            <th className="col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {(tab === 'All' ? customers : customers.filter(c => c.status === tab)).map(c => (
              <tr key={c.co}>
                <td className="col-check"><input type="checkbox" className="cb" /></td>
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
                  <div className="row-actions"><Btn variant="ghost" sm>View</Btn></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Contact Outreach Sheet ───────────────────────────────────────────────────

const ContactOutreach = () => {
  const prospectsData = useProspects()
  const [copied, setCopied] = useState('')
  const handleCopy = (type: string) => {
    setCopied(type)
    setTimeout(() => setCopied(''), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Contact Outreach Sheet</div>
          <div className="page-desc">Select contacts and copy for RingCentral, email, or SMS campaigns.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Copy Numbers', 'Copy Emails', 'Copy Name + Number', 'Copy Name + Email'].map(a => (
            <Btn key={a} variant="secondary" sm onClick={() => handleCopy(a)}>
              <Ic n={I.copy} size={13} /> {a}
            </Btn>
          ))}
        </div>
      </div>

      {copied && (
        <div style={{ padding: '10px 20px', background: 'var(--green-bg)', borderBottom: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Ic n={I.check} size={14} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green-text)' }}>
            Copied "{copied}" — 7 eligible contacts. Excluded: 1 Removed, 0 Invalid, 0 Bounced.
          </span>
          <Btn variant="ghost" sm onClick={() => setCopied('')}><Ic n={I.x} size={13} /></Btn>
        </div>
      )}

      {/* Eligibility summary */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)', borderBottom: '1px solid var(--border-s)', flexShrink: 0 }}>
        {[
          { label: 'Call Eligible', val: 0, color: 'var(--teal)' },
          { label: 'Text Eligible', val: 0, color: 'var(--purple)' },
          { label: 'Email Eligible', val: 0, color: 'var(--brand)' },
          { label: 'Removed / Excluded', val: 0, color: 'var(--red)' },
        ].map(e => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <strong style={{ color: e.color, fontFamily: 'var(--mono)' }}>{e.val}</strong> {e.label}
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contacts…" /></div>
        <select className="sel"><option>All PICs</option></select>
        <div className="toolbar-right">
          <Btn variant="primary" sm style={{ background: '#1F2937' }}><Ic n={I.copy} size={13} /> Copy RingCentral Format</Btn>
        </div>
      </div>

      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" /></th>
            <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th>
            <th>City / State</th><th>PIC</th><th style={{ textAlign: 'center' }}>Call</th>
            <th style={{ textAlign: 'center' }}>Text</th><th style={{ textAlign: 'center' }}>Email</th>
            <th>Last Contacted</th>
          </tr></thead>
          <tbody>
            {prospectsData.map(r => {
              const callable = r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only')
              const textable = r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only')
              const emailable = r.cat === 'Proceed' && !!r.emailAddr
              return (
                <tr key={r.id} style={{ background: r.cat === 'Removed' ? 'var(--red-bg)' : undefined }}>
                  <td className="col-check"><input type="checkbox" className="cb" /></td>
                  <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{r.company}</td>
                  <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.phone}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--brand)' }}>{r.emailAddr || <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                  <td style={{ fontSize: 12 }}>{r.city}, {r.state}</td>
                  <td><ChipPIC label={r.pic} /></td>
                  <td style={{ textAlign: 'center' }}><EligDot on={callable} /></td>
                  <td style={{ textAlign: 'center' }}><EligDot on={textable} /></td>
                  <td style={{ textAlign: 'center' }}><EligDot on={emailable} /></td>
                  <td style={{ fontSize: 12, color: 'var(--t4)' }}>{r.id % 3 === 0 ? '2d ago' : r.id % 2 === 0 ? '1w ago' : 'Never'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Contracts ────────────────────────────────────────────────────────────────

const Contracts = () => {
  const contracts = [
    { ref: 'CT-2024-0042', co: 'Calgary Build Corp', contact: 'Wade S.', category: 'Open-Top', size: '40ft HC', qty: 3, value: 18600, pickup: 'Aug 15', pickStatus: 'Scheduled', status: 'Active', pic: 'JC', sale: 'SL-2024-0140' },
    { ref: 'CT-2024-0041', co: 'NorthStar Construction LLC', contact: 'Tom E.', category: 'High-Cube', size: '40ft HC', qty: 4, value: 19200, pickup: 'Aug 8', pickStatus: 'Confirmed', status: 'Active', pic: 'JC', sale: 'SL-2024-0142' },
    { ref: 'CT-2024-0039', co: 'Great Lakes Storage Solutions', contact: 'Ryan M.', category: 'Dry', size: '20ft', qty: 6, value: 15600, pickup: 'Jul 30', pickStatus: 'Picked Up', status: 'Completed', pic: 'MS', sale: 'SL-2024-0141' },
    { ref: 'CT-2024-0037', co: 'Bakken Industrial LLC', contact: 'Mark J.', category: 'Office', size: '20ft HC', qty: 3, value: 18600, pickup: 'Jul 18', pickStatus: 'Overdue', status: 'Active', pic: 'JC', sale: 'SL-2024-0139' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {contracts.some(c => c.pickStatus === 'Overdue') && (
        <div style={{ padding: '10px 20px', background: 'var(--red-bg)', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ic n={I.warning} size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red-text)' }}>
            1 pickup is overdue — Bakken Industrial LLC · CT-2024-0037 · 11 days overdue
          </span>
          <Btn variant="ghost" sm style={{ marginLeft: 'auto', color: 'var(--red)' }}>Reschedule</Btn>
        </div>
      )}
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search contracts…" /></div>
        <select className="sel"><option>All Statuses</option></select>
        <select className="sel"><option>All Pickup Statuses</option><option>Overdue</option></select>
        <div className="toolbar-right">
          <Btn variant="primary" sm><Ic n={I.plus} size={13} /> New Contract</Btn>
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
              <tr key={c.ref} style={{ background: c.pickStatus === 'Overdue' ? 'var(--red-bg)' : undefined }}>
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
                  <div className="row-actions"><Btn variant="ghost" sm>View</Btn></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Daily Tasks ──────────────────────────────────────────────────────────────

const DailyTasks = () => (
  <div className="page-scroll">
    <div className="page-header" style={{ borderBottom: 'none' }}>
      <div>
        <div className="page-title">Daily Completed Tasks</div>
        <div className="page-desc">Record outreach activity completed today — Monday, Jul 29, 2024</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="secondary" sm><Ic n={I.calendar} size={13} /> Previous Entries</Btn>
        <Btn variant="primary" sm><Ic n={I.check} size={13} /> Save Today's Entry</Btn>
      </div>
    </div>
    <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      {/* Outreach targets */}
      {[
        { title: 'Email Activity', icon: I.mail, color: '#315EF6', fields: [
          { label: 'Email Target', val: '0' }, { label: 'Emails Completed', val: '0' },
          { label: 'Email Replies', val: '0' }, { label: 'Bounced / Failed', val: '0' },
        ]},
        { title: 'Call Activity', icon: I.phone, color: '#0D9488', fields: [
          { label: 'Call Minimum Target', val: '0' }, { label: 'Preferred Target', val: '0' },
          { label: 'Calls Completed', val: '0' }, { label: 'Calls Answered', val: '0' },
          { label: 'Calls Unanswered', val: '0' },
        ]},
        { title: 'Text / SMS Activity', icon: I.inquiry, color: '#7C3AED', fields: [
          { label: 'Text Target', val: '0' }, { label: 'Texts Completed', val: '0' },
          { label: 'Text Replies', val: '0' }, { label: 'Opted Out', val: '0' },
        ]},
      ].map(section => (
        <div key={section.title} className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic n={section.icon} size={16} style={{ color: section.color }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{section.title}</span>
          </div>
          {section.fields.map(f => (
            <div key={f.label} style={{ marginBottom: 10 }}>
              <label className="form-label">{f.label}</label>
              <input className="inp" defaultValue={f.val} type="number" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }} />
            </div>
          ))}
        </div>
      ))}

      {/* Results */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Leads &amp; Conversions</div>
        {[
          { label: 'Warm Leads Generated', val: '0' },
          { label: 'Inquiries Generated', val: '0' },
          { label: 'Quotations Generated', val: '0' },
          { label: 'Sales Generated', val: '0' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 10 }}>
            <label className="form-label">{f.label}</label>
            <input className="inp" defaultValue={f.val} type="number" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }} />
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 18, gridColumn: '2 / 4' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>PIC &amp; Notes</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">Entry Date</label>
            <input className="inp" defaultValue="Jul 29, 2024" />
          </div>
          <div>
            <label className="form-label">PIC (Person In Charge)</label>
            <select className="sel" style={{ width: '100%', height: 36 }}>
              <option>James Carter</option><option>Maria Santos</option><option>David Liu</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label">Notes</label>
          <textarea className="inp" rows={3} placeholder="Daily notes, challenges, observations…" style={{ height: 'auto', padding: '10px 12px' }} />
        </div>
      </div>
    </div>
  </div>
)

// ─── Removed Sheet ────────────────────────────────────────────────────────────

const RemovedSheet = () => {
  const [showPaste, setShowPaste] = useState(false)
  const [data, setData] = useState<any[]>([])
  const [search, setSearch] = useState('')
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
  }, [])
  const filtered = data.filter(row => {
    const term = search.trim().toLowerCase()
    return !term || [row.co, row.contact, row.phone, row.email, row.reason]
      .some(value => String(value || '').toLowerCase().includes(term))
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 20px', background: '#FFF1F2', borderBottom: '1px solid #FECDD3', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Ic n={I.warning} size={15} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9F1239' }}>All records here are excluded from call, text, and email outreach automatically.</span>
      </div>
      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search removed records…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel"><option>All Types</option><option>Phone Only</option><option>Email Only</option><option>Entire Contact</option></select>
        <select className="sel"><option>All Reasons</option><option>Opted Out</option><option>Bounced</option></select>
        <div className="toolbar-right">
          <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste Opted-Out</Btn>
          <Btn variant="ghost" sm onClick={() => exportToCSV(data, 'removed')}><Ic n={I.export} size={13} /> Export</Btn>
          <Btn variant="danger" sm><Ic n={I.plus} size={13} /> Add Entry</Btn>
        </div>
      </div>
      <div className="table-wrap">
        <table className="crm">
          <thead><tr>
            <th className="col-check"><input type="checkbox" className="cb" /></th>
            <th>Date</th><th>Removal Type</th><th>Phone</th><th>Email</th>
            <th>Company</th><th>Contact</th><th>Reason</th><th>Channel</th>
            <th>Prev Status</th><th>Curr Status</th><th>Added By</th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id || i} style={{ background: 'var(--red-bg)' }}>
                <td className="col-check"><input type="checkbox" className="cb" /></td>
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
              <textarea className="inp" rows={8} placeholder={'+1-206-555-0088\nbounce@example.com\n+1-701-555-0341'} style={{ height: 'auto', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12 }} />
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--t4)' }}>Detected: 0 entries</div>
            </div>
            <div className="modal-footer">
              <Btn variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Btn>
              <Btn variant="danger">Match &amp; Remove</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Deliverability ───────────────────────────────────────────────────────────

const Deliverability = () => {
  const [tab, setTab] = useState('Email')
  const results = [
    { pasted: 'bounce@oldco.net', co: 'Sunset Trading Co', contact: 'Mike Ward', type: 'Hard Bounce', current: 'Mail Delivery Report', recommended: 'Removed', action: 'Apply' },
    { pasted: 'info@closedco.com', co: '—', contact: '—', type: 'Domain Not Found', current: '—', recommended: 'Skip', action: 'Skip' },
    { pasted: 'karen@nlgroup.com', co: 'Northern Logistics Group', contact: 'Karen Olson', type: 'Mailbox Full', current: 'Mail Delivery Report', recommended: 'Mail Delivery Report + Warning', action: 'Review' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tabs">
        {['Email', 'Phone / SMS', 'Processing History', 'Unmatched'].map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <Btn variant="secondary" sm><Ic n={I.copy} size={13} /> Paste {tab === 'Email' ? 'Bounced Emails' : 'Failed Numbers'}</Btn>
        <Btn variant="secondary" sm><Ic n={I.upload} size={13} /> Upload CSV</Btn>
        <div style={{ padding: '6px 12px', background: 'var(--s2)', borderRadius: 8, fontSize: 12, color: 'var(--t3)' }}>
          Paste results from your email provider or RingCentral and the system will automatically match CRM records.
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-s)', fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>Processing Results</div>
          <table className="crm">
            <thead><tr><th>Pasted Value</th><th>Matched Company</th><th>Contact</th><th>Type</th><th>Current Status</th><th>Recommended</th><th className="col-actions">Action</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 12 }}>{r.pasted}</td>
                  <td style={{ fontWeight: 600, fontSize: 12.5 }}>{r.co}</td>
                  <td style={{ fontSize: 12.5 }}>{r.contact}</td>
                  <td><span className="badge b-amber">{r.type}</span></td>
                  <td style={{ fontSize: 12.5 }}>{r.current === '—' ? <span style={{ color: 'var(--t4)' }}>—</span> : r.current}</td>
                  <td><span style={{ fontSize: 12.5, fontWeight: 600, color: r.recommended === 'Removed' ? 'var(--red)' : r.recommended === 'Skip' ? 'var(--t4)' : 'var(--amber)' }}>{r.recommended}</span></td>
                  <td className="col-actions">
                    <div className="row-actions" style={{ opacity: 1 }}>
                      {r.action === 'Apply' && <Btn variant="danger" sm>Apply</Btn>}
                      {r.action === 'Review' && <Btn variant="secondary" sm>Review</Btn>}
                      {r.action === 'Skip' && <Btn variant="ghost" sm style={{ color: 'var(--t4)' }}>Skip</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
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
    </div>
  )
}

// ─── Container Catalog ────────────────────────────────────────────────────────

const ContainerCatalog = () => (
  <div className="page-scroll">
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Dry Container', units: 142, color: '#315EF6' },
          { label: 'High-Cube Container', units: 98, color: '#7C3AED' },
          { label: 'Office Container', units: 28, color: '#0D9488' },
          { label: 'Storage Container', units: 61, color: '#D97706' },
          { label: 'Double-Door Container', units: 34, color: '#EA580C' },
          { label: 'Refrigerated Container', units: 15, color: '#DC2626' },
          { label: 'Open-Top Container', units: 22, color: '#059669' },
          { label: 'Flat-Rack Container', units: 18, color: '#6B7280' },
        ].map(cat => (
          <div key={cat.label} className="kpi-card" style={{ borderTop: `3px solid ${cat.color}`, cursor: 'pointer' }}>
            <div className="kpi-label">{cat.label}</div>
            <div className="kpi-value" style={{ fontSize: 28, color: cat.color }}>{cat.units}</div>
            <div className="kpi-sub">units available</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Available Sizes</div>
          {['10 ft', '20 ft', '20 ft HC', '40 ft HC', '45 ft HC', '53 ft HC'].map(s => (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
              <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{s}</span>
              <span className="badge b-green">Available</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Condition Grades</div>
          {['Brand New', 'One Trip', 'Cargo Worthy', 'Wind & Watertight', 'Refurbished', 'Modified', 'As-Is', 'Used'].map((c, i) => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
              <span style={{ fontSize: 13 }}>{c}</span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--t1)' }}>{[142, 98, 34, 22, 28, 18, 15, 61][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)

// ─── PIC Performance ─────────────────────────────────────────────────────────

const PICPerformance = () => (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 16 }}>
      <p className="greeting-title">PIC Performance</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="date-range"><Ic n={I.calendar} size={13} /><span>This Month</span><Ic n={I.chevDown} size={12} /></div>
        <Btn variant="ghost" sm onClick={() => exportToCSV(PIC_DATA, 'pic_performance')}><Ic n={I.export} size={13} /> Export</Btn>
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
)

// ─── Profit Analytics ─────────────────────────────────────────────────────────

const ProfitAnalytics = () => (
  <div className="page-scroll">
    <div className="greeting-bar" style={{ marginBottom: 0 }}>
      <p className="greeting-title">Profit Analytics</p>
      <div className="date-range"><Ic n={I.calendar} size={13} /><span>2024 YTD</span><Ic n={I.chevDown} size={12} /></div>
    </div>
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'YTD Revenue', val: '$0', color: 'var(--brand)' },
          { label: 'YTD Buying Cost', val: '$0', color: 'var(--t3)' },
          { label: 'YTD Gross Profit', val: '$0', color: 'var(--green)' },
          { label: 'Avg Profit Margin', val: '0%', color: 'var(--teal)' },
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
)

// ─── Admin pages ──────────────────────────────────────────────────────────────

const DailyTargets = () => (
  <div className="page-scroll">
    <div className="page-content" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">Daily Targets Configuration</div>
        <div className="page-desc">Set the outreach and profit targets used across dashboards and reports.</div>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <div className="form-section">Monthly Targets</div>
        {[
          { label: 'Monthly Gross Profit Target ($)', val: '0' },
          { label: 'Working Days per Month', val: '0' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label className="form-label">{f.label}</label>
            <input className="inp" defaultValue={f.val} type="number" />
          </div>
        ))}
        <div className="form-section">Daily Outreach Targets</div>
        {[
          { label: 'Daily Email Target', val: '0' },
          { label: 'Daily Call Target (Minimum)', val: '0' },
          { label: 'Daily Call Target (Preferred)', val: '0' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label className="form-label">{f.label}</label>
            <input className="inp" defaultValue={f.val} type="number" />
          </div>
        ))}
        <Btn variant="primary" style={{ marginTop: 8 }}><Ic n={I.check} size={14} /> Save Targets</Btn>
      </div>
    </div>
  </div>
)

const ServiceTerritories = () => (
  <div className="page-scroll">
    <div className="page-content">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="page-title">Service Territory Settings</div>
          <div className="page-desc">Configure supported US states and Canadian provinces.</div>
        </div>
        <Btn variant="primary" sm><Ic n={I.check} size={13} /> Save Changes</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { title: 'Northern United States', states: ['Minnesota', 'Wisconsin', 'Michigan', 'Illinois', 'Indiana', 'Ohio', 'North Dakota', 'South Dakota', 'Montana', 'Idaho', 'Washington', 'Oregon', 'Iowa', 'Nebraska', 'Wyoming', 'Colorado', 'Pennsylvania', 'New York'], color: 'var(--brand)', bg: 'var(--brand-bg)' },
          { title: 'Canadian Provinces', states: ['Alberta', 'British Columbia', 'Saskatchewan', 'Manitoba', 'Ontario', 'Quebec', 'Nova Scotia', 'New Brunswick'], color: 'var(--green)', bg: 'var(--green-bg)' },
        ].map(section => (
          <div key={section.title} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>{section.title}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {section.states.map(s => (
                <div key={s} style={{ padding: '5px 10px', borderRadius: 7, background: section.bg, color: section.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ✓ {s}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

type GoogleConnectionStatus = {
  configured: boolean
  connected: boolean
  email: string | null
}

const SystemSettings = () => {
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
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Sales Representatives (PICs)</div>
            <Btn variant="primary" sm><Ic n={I.plus} size={13} /> Add PIC</Btn>
          </div>
          {PIC_DATA.map((p, i) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-s)' }}>
              <div className="avatar" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 12, background: ['#315EF620','#7C3AED20','#0D948820','#D9770620'][i], color: ['#315EF6','#7C3AED','#0D9488','#D97706'][i] }}>{p.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{p.sales} sales · ${p.profit.toLocaleString()} profit this month</div>
              </div>
              <span className="badge b-green">Active</span>
              <Btn variant="ghost" sm><Ic n={I.edit} size={13} /></Btn>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  )
}

// ─── Generic placeholder ──────────────────────────────────────────────────────

const Placeholder = ({ label }: { label: string }) => (
  <div className="empty" style={{ padding: 80 }}>
    <div className="empty-icon"><Ic n={I.container} size={48} /></div>
    <div className="empty-title">{label}</div>
    <div className="empty-desc">This module is fully structured and ready for data integration.</div>
    <Btn variant="primary" sm style={{ marginTop: 16 }}><Ic n={I.plus} size={13} /> Get Started</Btn>
  </div>
)

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).has('google_sync') ? 'system-settings' : 'dashboard'
  )
  const [sidebarMode, setSidebarModeState] = useState<'expanded' | 'collapsed' | 'hover'>(() => {
    return (localStorage.getItem('sidebarMode') as any) || 'expanded'
  })
  const setSidebarMode = (mode: 'expanded' | 'collapsed' | 'hover') => {
    localStorage.setItem('sidebarMode', mode)
    setSidebarModeState(mode)
  }
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const [session, setSession] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        supabase.from('profiles').update({ google_refresh_token: session.provider_refresh_token, google_email: session.user.email }).eq('id', session.user.id).then();
      }
      setAuthChecking(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        supabase.from('profiles').update({ google_refresh_token: session.provider_refresh_token, google_email: session.user.email }).eq('id', session.user.id).then();
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleNav = useCallback((s: Screen) => setScreen(s), [])

  if (authChecking) return null;
  if (!session) return <Login onLogin={() => {}} />;

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':           return <Dashboard onNav={handleNav} />
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
      case 'system-settings':     return <SystemSettings />
      case 'pickups':             return <Placeholder label="Pickup Tracking" />
      case 'best-clients':        return <Placeholder label="Best Clients" />
      case 'inquiry-funnel':      return <Placeholder label="Inquiry Funnel" />
      default:                    return <Dashboard onNav={handleNav} />
    }
  }

  const isSidebarExpanded = sidebarMode === 'expanded' || (sidebarMode === 'hover' && isHoveringSidebar)

  return (
    <div data-theme={isDark ? 'dark' : undefined} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <div 
        onMouseEnter={() => setIsHoveringSidebar(true)} 
        onMouseLeave={() => setIsHoveringSidebar(false)}
        style={{ display: 'flex' }}
      >
        <Sidebar 
          active={screen} 
          onNav={handleNav} 
          expanded={isSidebarExpanded} 
          mode={sidebarMode}
          onModeChange={setSidebarMode}
        />
      </div>

      <div className="workspace">
        <div className="ws-card">
          <TopBar isDark={isDark} onToggleDark={() => setIsDark(d => !d)} />
          {renderScreen()}
        </div>
      </div>
    </div>
  )
}
