import { useState, useCallback, useEffect, Suspense, lazy } from 'react'
import { api } from '../lib/api'
import { ToastHost, ConfirmHost } from '../lib/notify'
import Sidebar from '../components/layout/Sidebar'
import TopBar from '../components/layout/TopBar'
import type { Screen } from './types'
import Dashboard from '../features/dashboard/Dashboard'
import OutreachDashboard from '../features/outreach/OutreachDashboard'
import InquiryDashboard from '../features/inquiries/InquiryDashboard'
import ProspectSheet from '../features/prospects/ProspectSheet'
import InquiryList from '../features/inquiries/InquiryList'
import QuotationList from '../features/quotations/QuotationList'
import SalesTracker from '../features/sales/SalesTracker'
import CustomerAccounts from '../features/customers/CustomerAccounts'
import ContactOutreach from '../features/outreach/ContactOutreach'
import DailyTasks from '../features/outreach/DailyTasks'
import RemovedSheet from '../features/outreach/RemovedSheet'
import Deliverability from '../features/outreach/Deliverability'
import Contracts from '../features/contracts/Contracts'
import Pickups from '../features/pickups/Pickups'
import ContainerCatalog from '../features/catalog/ContainerCatalog'
import PICPerformance from '../features/analytics/PICPerformance'
import ProfitAnalytics from '../features/analytics/ProfitAnalytics'
import BestClients from '../features/analytics/BestClients'
import InquiryFunnel from '../features/analytics/InquiryFunnel'
import InquiryValidation from '../features/procurement/InquiryValidation'
import InventoryManagement from '../features/inventory/InventoryManagement'
import MonthlyReport from '../features/reports/MonthlyReport'
import DailyTargets from '../features/targets/DailyTargets'
import ServiceTerritories from '../features/territories/ServiceTerritories'
import SystemSettings from '../features/settings/SystemSettings'

// Rarely reached admin screens stay lazy so they keep their own chunks.
const UserProfileSettings = lazy(() => import('../features/settings/UserProfileSettings').then(m => ({ default: m.UserProfileSettings })))
const UserManagement = lazy(() => import('../features/settings/UserManagement').then(m => ({ default: m.UserManagement })))

type AppShellProps = {
  session: any
  currentProfile: { role?: string } | null
}

// Owns screen selection and the surrounding chrome. Session and profile are
// resolved by App and passed in, so this component never touches auth.
export default function AppShell({ session, currentProfile }: AppShellProps) {
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

  const handleNav = useCallback((s: Screen) => setScreen(s), [])

  // Roles without a dashboard land on their own home screen instead.
  useEffect(() => {
    const role = currentProfile?.role
    if (role === 'operations') setScreen(s => s === 'dashboard' ? 'pickups' : s)
    else if (role === 'procurement') setScreen(s => s === 'dashboard' ? 'inquiry-validation' : s)
  }, [currentProfile])

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
