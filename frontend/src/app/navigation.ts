import { I } from '../components/ui/icons'
import type { NavGroup, Screen } from './types'

export const NAV: NavGroup[] = [
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
      { id: 'active-clients', label: 'Active Clients', icon: I.customer, roles: ['admin', 'sales_manager'] },
      { id: 'customers', label: 'Customer Accounts (Master)', icon: I.customer, roles: ['admin', 'operations', 'sales_manager'] },
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

export const SCREEN_LABELS: Record<Screen, string> = {
  'dashboard': 'Executive Overview',
  'outreach-dashboard': 'Outreach Dashboard',
  'inquiry-dashboard': 'Inquiry Dashboard',
  'prospects': 'Prospect Clients',
  'warm-leads': 'Warm Leads',
  'inquiries': 'Inquiries',
  'quotations': 'Quotations',
  'sales-tracker': 'Sales Tracker',
  'active-clients': 'Active Clients Dashboard',
  'customers': 'Customer Accounts (Master)',
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

