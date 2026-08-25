import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class AnalyticsController {
  
  static async getDashboardMetrics(req: Request, res: Response) {
    try {
      // 1. Sales metrics
      const { data: sales, error: salesErr } = await supabaseAdmin
        .from('sales')
        .select('total_units, revenue, gross_profit, company_id')
        .eq('status', 'Won');

      if (salesErr) throw salesErr;

      let total_units = 0;
      let total_revenue = 0;
      let total_gross_profit = 0;
      const unique_clients = new Set();

      for (const sale of (sales || [])) {
        total_units += sale.total_units;
        total_revenue += Number(sale.revenue);
        total_gross_profit += Number(sale.gross_profit);
        unique_clients.add(sale.company_id);
      }

      const active_clients = unique_clients.size;
      const profit_margin = total_revenue > 0 ? (total_gross_profit / total_revenue) * 100 : 0;

      // 2. Funnel metrics (Counts)
      const [{ count: prospectsCount }, { count: warmLeadsCount }, { count: inquiriesCount }] = await Promise.all([
        supabaseAdmin.from('prospect_clients').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('warm_leads').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('inquiries').select('*', { count: 'exact', head: true })
      ]);

      res.json({
        success: true,
        data: {
          metrics: {
            total_units,
            total_revenue,
            total_gross_profit,
            active_clients,
            profit_margin,
          },
          funnel: {
            prospects: prospectsCount || 0,
            warm_leads: warmLeadsCount || 0,
            inquiries: inquiriesCount || 0,
            sales: sales?.length || 0
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
