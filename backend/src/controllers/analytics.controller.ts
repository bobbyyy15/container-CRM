import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export class AnalyticsController {
  
  static async getDashboardMetrics(req: Request, res: Response) {
    try {
      const isAdmin = req.auth?.profile.role === 'admin';
      const picId = req.auth?.profile.pic_id;

      // 1. Sales metrics
      let salesQuery = supabaseAdmin
        .from('sales')
        .select('total_units, revenue, gross_profit, company_id')
        .eq('status', 'Won');

      if (!isAdmin) salesQuery = salesQuery.eq('pic_id', picId);

      const { data: sales, error: salesErr } = await salesQuery;

      if (salesErr) throw salesErr;

      let total_units = 0;
      let total_revenue = 0;
      let total_gross_profit = 0;

      for (const sale of (sales || [])) {
        total_units += sale.total_units;
        total_revenue += Number(sale.revenue);
        total_gross_profit += Number(sale.gross_profit);
      }

      let activeClientsQuery = supabaseAdmin
        .from('customer_accounts_view')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active');
      
      if (!isAdmin) activeClientsQuery = activeClientsQuery.eq('pic_id', picId);
      const { count: active_clients_count } = await activeClientsQuery;
      
      const active_clients = active_clients_count || 0;
      const profit_margin = total_revenue > 0 ? (total_gross_profit / total_revenue) * 100 : 0;

      // 2. Funnel metrics (Counts)
      let pQuery = supabaseAdmin.from('prospect_clients').select('*', { count: 'exact', head: true }).eq('lifecycle_status', 'active');
      let wQuery = supabaseAdmin.from('warm_leads').select('*', { count: 'exact', head: true }).eq('status', 'active');
      let iQuery = supabaseAdmin.from('inquiries').select('*', { count: 'exact', head: true }).not('status', 'in', '(Removed,Lost,Quotation Created,Converted to Sale)');
      let qQuery = supabaseAdmin.from('quotations').select('*', { count: 'exact', head: true }).not('status', 'in', '(Converted,Rejected)');

      if (!isAdmin) {
        pQuery = pQuery.eq('pic_id', picId);
        wQuery = wQuery.eq('pic_id', picId);
        iQuery = iQuery.eq('pic_id', picId);
        qQuery = qQuery.eq('pic_id', picId);
      }

      const [prospects, warmLeads, inquiries, quotations] = await Promise.all([pQuery, wQuery, iQuery, qQuery]);
      
      const countError = prospects.error || warmLeads.error || inquiries.error || quotations.error;
      if (countError) throw countError;

      // 3. Fetch Chart Data via RPC
      const { data: chartData, error: chartError } = await supabaseAdmin.rpc('get_dashboard_charts', {
        p_pic_id: isAdmin ? null : picId
      });

      if (chartError) throw chartError;

      // 4. Month-to-date outreach actuals + the configured targets, so the Outreach
      //    Dashboard can show real "X of Y" progress instead of hardcoded numbers.
      //    Summed here rather than derived from PIC_DATA because that array is capped
      //    at the top 5 PICs and would undercount a larger team.
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);

      let activityQuery = supabaseAdmin
        .from('daily_activity')
        .select('emails_completed, calls_completed, texts_completed, email_replies, text_replies, calls_answered')
        .gte('entry_date', monthStartStr);
      if (!isAdmin) activityQuery = activityQuery.eq('pic_id', picId);

      const [{ data: activityRows, error: activityErr }, { data: targetsRow }] = await Promise.all([
        activityQuery,
        supabaseAdmin.from('daily_targets').select('*').eq('id', true).single(),
      ]);
      if (activityErr) throw activityErr;

      const outreach = (activityRows || []).reduce((acc, row: any) => ({
        emails:         acc.emails         + (row.emails_completed || 0),
        calls:          acc.calls          + (row.calls_completed  || 0),
        texts:          acc.texts          + (row.texts_completed  || 0),
        email_replies:  acc.email_replies  + (row.email_replies    || 0),
        text_replies:   acc.text_replies   + (row.text_replies     || 0),
        calls_answered: acc.calls_answered + (row.calls_answered   || 0),
      }), { emails: 0, calls: 0, texts: 0, email_replies: 0, text_replies: 0, calls_answered: 0 });

      res.json({
        success: true,
        data: {
          outreach,
          targets: targetsRow || {},
          metrics: {
            total_units,
            total_revenue,
            total_gross_profit,
            active_clients,
            profit_margin,
          },
          funnel: {
            prospects: prospects.count || 0,
            warm_leads: warmLeads.count || 0,
            inquiries: inquiries.count || 0,
            quotations: quotations.count || 0,
            sales: sales?.length || 0
          },
          charts: chartData || {}
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
