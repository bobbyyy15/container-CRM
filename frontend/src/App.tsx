import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from './config/supabase'
import { api } from './lib/api'
import { useRealtimeRevision, useRealtimeStatus } from './lib/realtime'
import { toast, askConfirm, askReason, ToastHost, ConfirmHost } from './lib/notify'
import Login from './Login'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import Dashboard from './features/dashboard/Dashboard'
import OutreachDashboard from './features/outreach/OutreachDashboard'
import InquiryDashboard from './features/inquiries/InquiryDashboard'
import ProspectSheet from './features/prospects/ProspectSheet'
import InquiryList from './features/inquiries/InquiryList'
import QuotationList from './features/quotations/QuotationList'
import SalesTracker from './features/sales/SalesTracker'
import CustomerAccounts from './features/customers/CustomerAccounts'
import ContactOutreach from './features/outreach/ContactOutreach'
import DailyTasks from './features/outreach/DailyTasks'
import RemovedSheet from './features/outreach/RemovedSheet'
import Deliverability from './features/outreach/Deliverability'
import Contracts from './features/contracts/Contracts'
import Pickups from './features/pickups/Pickups'
import ContainerCatalog from './features/catalog/ContainerCatalog'
import PICPerformance from './features/analytics/PICPerformance'
import ProfitAnalytics from './features/analytics/ProfitAnalytics'
import BestClients from './features/analytics/BestClients'
import InquiryFunnel from './features/analytics/InquiryFunnel'
import InquiryValidation from './features/procurement/InquiryValidation'
import InventoryManagement from './features/inventory/InventoryManagement'
import MonthlyReport from './features/reports/MonthlyReport'
import DailyTargets from './features/targets/DailyTargets'
import ServiceTerritories from './features/territories/ServiceTerritories'
import SystemSettings from './features/settings/SystemSettings'
import { Ic, I } from './components/ui/icons'
import Btn from './components/ui/Button'
import { Badge, Trend, Prog, Divider, EligDot, ChipPIC } from './components/ui/primitives'
import ExportMenu from './components/ui/ExportMenu'
import AssignPicModal from './components/ui/AssignPicModal'
import RecordDetailModal from './components/ui/RecordDetailModal'
import { NAV, SCREEN_LABELS } from './app/navigation'
import type {
  Screen, BadgeStatus, DetailField,
  ProfitChartPoint, ChartSlice, PicPerformanceRow, OverduePickupRow, LossReasonRow,
  AlternativeOffer, Territory, GoogleConnectionStatus, RemovedMatchRow, DensityOption,
} from './app/types'
import { exportToCSV, downloadPdfDocument, titleCase, readDensity, writeDensity } from './lib/exporters'
import { mapPipelineRow } from './hooks/mapPipelineRow'
import { useWarmLeads } from './hooks/useWarmLeads'
import { useProspects } from './hooks/useProspects'
import { useInquiries } from './hooks/useInquiries'
import { useQuotations } from './hooks/useQuotations'
import { useSales } from './hooks/useSales'
import { useAnalytics } from './hooks/useAnalytics'
import { useNotifications } from './hooks/useNotifications'
import { useContracts } from './hooks/useContracts'
import { useCustomers } from './hooks/useCustomers'
import { useInventory, useInventorySummary } from './hooks/useInventory'
import { useCatalogList } from './hooks/useCatalogList'
import { useInquiryBoard } from './hooks/useInquiryBoard'
// Admin screens and the import dialog are reached rarely, so they load on demand
// instead of riding along in the initial bundle. Login stays eager -- it is the
// first thing an unauthenticated visitor sees.
const UserProfileSettings = lazy(() => import('./features/settings/UserProfileSettings').then(m => ({ default: m.UserProfileSettings })))
const UserManagement = lazy(() => import('./features/settings/UserManagement').then(m => ({ default: m.UserManagement })))
const ResetPassword = lazy(() => import('./features/settings/ResetPassword'))
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


// Every "PDF" action builds a real tabular document -- masthead, metadata line,
// then one bordered table per section -- and prints only that. Printing the live
// screen instead just photographs the dashboard onto paper, which is not a report.

// Brand palette, as RGB triples because jsPDF takes numeric channels.

// Row objects use terse internal keys (co, buyPU, neededBy...). Left alone they
// produce unreadable column headings, so map the worst offenders and split
// camelCase for the rest.

// Internal identifiers are meaningless in a printed report (they stay in the CSV
// and Excel exports, where data fidelity matters more than readability).


// ─── Persisted UI preferences ─────────────────────────────────────────────────
// localStorage throws rather than no-ops in some contexts (Safari private mode,
// blocked third-party storage), so every access is guarded -- a preference is
// never worth crashing a screen over.






// `enabled` exists because ProspectSheet renders both the Prospect and Warm Lead
// views from one component -- without it, opening either page fetched both lists.








// `limit` keeps the dashboard's "top 5" from pulling the entire customer table
// across the network just to discard almost all of it.



// A read-only detail view for a single row of an already-loaded list (Inquiries, Quotations,
// Sales, Contracts, Customers, etc). No extra API call needed -- the row already has every
// field the table shows, this just lays them out full-size instead of squeezed into a table cell.
// ─── Sidebar ──────────────────────────────────────────────────────────────────

// ─── TopBar ───────────────────────────────────────────────────────────────────


// ─── Dashboard ────────────────────────────────────────────────────────────────

// ─── Outreach Dashboard ───────────────────────────────────────────────────────

// ─── Inquiry Dashboard ────────────────────────────────────────────────────────

// ─── Prospect / Warm Lead Sheet ───────────────────────────────────────────────

// ─── Inquiry List ─────────────────────────────────────────────────────────────

// ─── Quotation List ───────────────────────────────────────────────────────────

// ─── Sales Tracker ────────────────────────────────────────────────────────────

// ─── Customer Accounts ────────────────────────────────────────────────────────

// ─── Contact Outreach Sheet ───────────────────────────────────────────────────

// ─── Contracts ────────────────────────────────────────────────────────────────

// ─── Daily Tasks ──────────────────────────────────────────────────────────────



// ─── Removed Sheet ────────────────────────────────────────────────────────────

// ─── Deliverability ───────────────────────────────────────────────────────────


// ─── Container Catalog ────────────────────────────────────────────────────────


// ─── PIC Performance ─────────────────────────────────────────────────────────

// ─── Profit Analytics ─────────────────────────────────────────────────────────

// ─── Best Clients ─────────────────────────────────────────────────────────────

// Real inquiry.status values, as actually set by the backend (see
// create_inquiry_from_warm_lead / create_quotation / convert_to_sale in the SQL migrations)
// -- not the larger aspirational status list in BadgeStatus, most of which nothing ever sets.

// ─── Inquiry Validation (Procurement) ──────────────────────────────────────────










// ─── Inventory Management ─────────────────────────────────────────────────────

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
  if (isPasswordRecovery) return (
    <>
      <Suspense fallback={<div className="loading-row"><span className="spinner" />Loading…</div>}>
        <ResetPassword onDone={() => setIsPasswordRecovery(false)} />
      </Suspense>
      <ToastHost />
    </>
  );
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
        transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
          <div key={screen} className="screen-transition">
            <Suspense fallback={<div className="loading-row"><span className="spinner" />Loading…</div>}>
              {renderScreen()}
            </Suspense>
          </div>
        </div>
      </div>
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}
