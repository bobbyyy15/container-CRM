import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

/**
 * The dashboard's date range. Sales figures are the only period-shaped numbers on it --
 * the funnel counts what is open right now and outreach is always month to date -- so this
 * decides which sales a KPI counts, and which earlier window it is compared against.
 *
 * 'all' has no previous window by definition, which is why the comparison is nullable
 * rather than zero: nothing to compare is not the same as no change.
 */
type RangeKey = 'month' | 'quarter' | 'year' | 'all';

const RANGE_KEYS: RangeKey[] = ['month', 'quarter', 'year', 'all'];

const RANGE_LABELS: Record<RangeKey, { label: string; previousLabel: string }> = {
  month:   { label: 'This month',   previousLabel: 'last month' },
  quarter: { label: 'This quarter', previousLabel: 'last quarter' },
  year:    { label: 'This year',    previousLabel: 'last year' },
  all:     { label: 'All time',     previousLabel: '' },
};

/** How many months of the configured monthly target the selected range covers. */
const TARGET_MONTHS: Record<RangeKey, number | null> = { month: 1, quarter: 3, year: 12, all: null };

const startOf = (range: RangeKey, from: Date): Date | null => {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  switch (range) {
    case 'month':   return new Date(date.getFullYear(), date.getMonth(), 1);
    case 'quarter': return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
    case 'year':    return new Date(date.getFullYear(), 0, 1);
    case 'all':     return null;
  }
};

/** The window immediately before `start`, the same length as the range. */
const previousStartOf = (range: RangeKey, start: Date): Date => {
  switch (range) {
    case 'month':   return new Date(start.getFullYear(), start.getMonth() - 1, 1);
    case 'quarter': return new Date(start.getFullYear(), start.getMonth() - 3, 1);
    case 'year':    return new Date(start.getFullYear() - 1, 0, 1);
    case 'all':     return start;
  }
};

type SaleTotals = { total_units: number; total_revenue: number; total_gross_profit: number; profit_margin: number; sales_count: number };

const sumSales = (rows: any[]): SaleTotals => {
  const totals = rows.reduce((acc, sale) => ({
    total_units: acc.total_units + (sale.total_units || 0),
    total_revenue: acc.total_revenue + Number(sale.revenue || 0),
    total_gross_profit: acc.total_gross_profit + Number(sale.gross_profit || 0),
  }), { total_units: 0, total_revenue: 0, total_gross_profit: 0 });
  return {
    ...totals,
    profit_margin: totals.total_revenue > 0 ? (totals.total_gross_profit / totals.total_revenue) * 100 : 0,
    sales_count: rows.length,
  };
};

export class AnalyticsController {
  
  static async getDashboardMetrics(req: Request, res: Response) {
    try {
      const isAdmin = req.auth?.profile.role === 'admin';
      const picId = req.auth?.profile.pic_id;

      const requested = String(req.query.range ?? 'month') as RangeKey;
      const range: RangeKey = RANGE_KEYS.includes(requested) ? requested : 'month';
      const now = new Date();
      const rangeStart = startOf(range, now);
      const previousStart = rangeStart ? previousStartOf(range, rangeStart) : null;

      // 1. Sales metrics, for the selected window and the one before it. Both windows come
      //    from one query so the two figures can never be read at different moments.
      let salesQuery = supabaseAdmin
        .from('sales')
        .select('total_units, revenue, gross_profit, company_id, created_at')
        .eq('status', 'Won');

      if (!isAdmin) salesQuery = salesQuery.eq('pic_id', picId);
      if (previousStart) salesQuery = salesQuery.gte('created_at', previousStart.toISOString());

      const { data: salesRows, error: salesErr } = await salesQuery;

      if (salesErr) throw salesErr;

      const inWindow = (row: any, from: Date | null, until: Date | null) => {
        const at = new Date(row.created_at);
        return (!from || at >= from) && (!until || at < until);
      };

      const sales = rangeStart ? (salesRows || []).filter(row => inWindow(row, rangeStart, null)) : (salesRows || []);
      const current = sumSales(sales);
      const previous = rangeStart && previousStart
        ? sumSales((salesRows || []).filter(row => inWindow(row, previousStart, rangeStart)))
        : null;

      const { total_units, total_revenue, total_gross_profit } = current;

      let activeClientsQuery = supabaseAdmin
        .from('customer_accounts_view')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active');
      
      if (!isAdmin) activeClientsQuery = activeClientsQuery.eq('pic_id', picId);
      const { count: active_clients_count } = await activeClientsQuery;
      
      const active_clients = active_clients_count || 0;
      const profit_margin = current.profit_margin;

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
        .select('emails_completed, calls_completed, texts_completed, email_replies, text_replies, calls_answered, calls_unanswered')
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
        calls_answered:   acc.calls_answered   + (row.calls_answered   || 0),
        calls_unanswered: acc.calls_unanswered + (row.calls_unanswered || 0),
      }), { emails: 0, calls: 0, texts: 0, email_replies: 0, text_replies: 0, calls_answered: 0, calls_unanswered: 0 });

      const targetMonths = TARGET_MONTHS[range];
      const monthlyTarget = Number((targetsRow as any)?.monthly_gross_profit_target) || 0;

      res.json({
        success: true,
        data: {
          outreach,
          targets: targetsRow || {},
          range: {
            key: range,
            label: RANGE_LABELS[range].label,
            previousLabel: RANGE_LABELS[range].previousLabel,
            start: rangeStart ? rangeStart.toISOString() : null,
            // The configured target is monthly, so a longer range is measured against the
            // same target multiplied out. All time has no meaningful target.
            profitTarget: targetMonths && monthlyTarget > 0 ? monthlyTarget * targetMonths : 0,
            targetMonths,
          },
          previous,
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
