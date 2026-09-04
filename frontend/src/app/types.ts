import type React from 'react'

export type Screen =
  | 'dashboard' | 'outreach-dashboard' | 'inquiry-dashboard'
  | 'prospects' | 'warm-leads' | 'inquiries' | 'quotations' | 'sales-tracker' | 'active-clients'
  | 'customers' | 'contact-outreach' | 'contracts' | 'pickups'
  | 'daily-tasks' | 'removed' | 'deliverability'
  | 'container-catalog'
  | 'pic-performance' | 'best-clients' | 'profit-analytics' | 'inquiry-funnel'
  | 'service-territories' | 'daily-targets' | 'system-settings' | 'profile-settings'
  | 'user-management' | 'inquiry-validation' | 'inventory-management' | 'monthly-report'


export type NavItem = { id: Screen; label: string; icon: string; roles?: string[] }

export type NavGroup = { label: string; items: NavItem[] }

export type ProfitChartPoint = { m: string; profit: number; revenue: number; cost: number }

export type ChartSlice = { name: string; value: number; color: string }

export type PicPerformanceRow = {
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

export type OverduePickupRow = { contract: string; co: string; days: number; qty: number; size: string }

export type LossReasonRow = { reason: string; color: string; count: number }





export type BadgeStatus =
  | 'Proceed' | 'Removed' | 'Active' | 'Completed' | 'Lost' | 'Draft' | 'Sent'
  | 'New Inquiry' | 'Quotation Required' | 'Quotation Sent' | 'Negotiating' | 'Negotiation'
  | 'Converted to Sale' | 'Converted' | 'Pending' | 'Cancelled' | 'Call/Text' | 'Calls Only'
  | 'Text Only' | 'Mail Delivery Report' | 'Overdue' | 'Scheduled' | 'Confirmed'
  | 'Picked Up' | 'Accepted' | 'Rejected' | 'Under Review' | 'Awaiting Response'
  | 'Pending Validation' | 'Validation Rejected' | 'Quotation Created' | 'Quotation Rejected'
  | 'Available' | 'Unavailable' | 'Bounced' | 'Hard Bounce' | 'Soft Bounce'
  | 'Unsubscribed' | 'Spam Complaint'

export type DetailField = { label: string; value: React.ReactNode }

export type AlternativeOffer = {
  containerSizeId?: string
  containerConditionId?: string
  quantity?: number
  askingPrice?: number
  notes?: string
}

export type Territory = { id: string; region: string; name: string; enabled: boolean }

export type GoogleConnectionStatus = {
  configured: boolean
  connected: boolean
  email: string | null
}

export type RemovedMatchRow = {
  raw_value: string
  identity_type: 'email' | 'phone'
  normalized_value: string
  company_name: string | null
  contact_name: string | null
  was_new: boolean
}

export type PdfSection = { title?: string; rows: Record<string, any>[] }


export type DensityOption = 'Compact' | 'Standard' | 'Comfortable'
