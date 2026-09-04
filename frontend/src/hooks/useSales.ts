import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useRealtimeRevision } from '../lib/realtime'

export const useSales = (revision = 0) => {
  const [data, setData] = useState<any[]>([])
  const liveRevision = useRealtimeRevision(['deals'])
  useEffect(() => {
    api.get('/deals/sales').then(res => {
      if (res.data.success) setData((res.data.data || []).map((row: any) => {
        const units = Number(row.total_units || 0)
        const buyingCost = Number(row.buying_cost || 0)
        const revenue = Number(row.revenue || 0)
        const profit = Number(row.gross_profit || 0)
        const quote = row.quotations || {}
        const item = quote.quotation_items?.[0]
        const fullName = (c: any) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : ''
        // A manual sale has no quotation, so fall back to the company's contact --
        // preferring the primary one. Without this the column was blank on every
        // directly recorded sale even though the contact was on file.
        const companyLinks = row.companies?.company_contacts ?? []
        const companyContact = (companyLinks.find((l: any) => l.is_primary) ?? companyLinks[0])?.contacts
        return {
          id: row.id,
          ref: `SAL-${row.id.slice(0, 8).toUpperCase()}`,
          date: new Date(row.created_at).toLocaleDateString(),
          createdAt: row.created_at,
          company: row.companies?.name || '',
          contact: fullName(quote.contacts) || fullName(companyContact),
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
  }, [revision, liveRevision])
  return data
}
