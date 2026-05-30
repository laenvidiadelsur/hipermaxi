import { supabase } from '../../lib/supabase';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export type DateRangeKey = 'hoy' | '7dias' | '30dias';

function getDateBounds(range: DateRangeKey): { from: string; to: string } {
  const now = new Date();
  const to = endOfDay(now).toISOString();
  if (range === 'hoy') return { from: startOfDay(now).toISOString(), to };
  if (range === '7dias') return { from: subDays(now, 7).toISOString(), to };
  return { from: subDays(now, 30).toISOString(), to };
}

export const dashboardService = {
  /** KPI totals: recordatorios, recaudado, promedio, tasa */
  async getKPIs(tenantId: string, range: DateRangeKey) {
    const { from, to } = getDateBounds(range);

    // Reminder logs for the period
    const { data: logs, error: logsErr } = await supabase
      .from('reminder_logs')
      .select(`
        id, success, sent_at,
        debt_details!inner(total, debt_details_qrs:debt_detail_qrs(qr_id), contacts!inner(tenant_id))
      `)
      .gte('sent_at', from)
      .lte('sent_at', to)
      .eq('debt_details.contacts.tenant_id', tenantId);

    if (logsErr) throw logsErr;

    const totalRecordatorios = logs?.length ?? 0;
    const exitosos = logs?.filter(l => l.success) ?? [];

    // Paid debt details in period (total recaudado)
    const { data: paidDebts, error: paidErr } = await supabase
      .from('debt_details')
      .select('total, contacts!inner(tenant_id)')
      .eq('debt_status', 'Paid')
      .eq('contacts.tenant_id', tenantId)
      .gte('updated_at', from)
      .lte('updated_at', to);

    if (paidErr) throw paidErr;

    const totalRecaudado = (paidDebts ?? []).reduce((s, d) => s + Number(d.total), 0);
    const promedioRecaudacion = paidDebts?.length ? totalRecaudado / paidDebts.length : 0;
    const tasaRecuperacion = totalRecordatorios > 0 ? (exitosos.length / totalRecordatorios) * 100 : 0;

    return {
      totalRecordatorios,
      totalRecaudado,
      promedioRecaudacion,
      tasaRecuperacion: Math.round(tasaRecuperacion * 10) / 10,
    };
  },

  /** Weekly activity: recordatorios vs pagos por semana */
  async getWeeklyActivity(tenantId: string) {
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const end = subDays(new Date(), i * 7);
      const start = subDays(end, 6);
      return { label: `Semana ${4 - i}`, from: startOfDay(start).toISOString(), to: endOfDay(end).toISOString() };
    }).reverse();

    const results = await Promise.all(
      weeks.map(async (w) => {
        const { count: recordatorios } = await supabase
          .from('reminder_logs')
          .select(
            `
            id,
            debt_details!inner(
              contacts!inner(tenant_id)
            )
          `,
            { count: 'exact', head: true }
          )
          .eq('debt_details.contacts.tenant_id', tenantId)
          .gte('sent_at', w.from)
          .lte('sent_at', w.to)
          .not('sent_at', 'is', null);

        const { count: pagos } = await supabase
          .from('debt_details')
          .select('id, contacts!inner(tenant_id)', { count: 'exact', head: true })
          .eq('debt_status', 'Paid')
          .eq('contacts.tenant_id', tenantId)
          .gte('updated_at', w.from)
          .lte('updated_at', w.to);

        return { categoria: w.label, recordatorios: recordatorios ?? 0, pagos: pagos ?? 0 };
      })
    );
    return results;
  },

  /** Daily collection amounts for chart */
  async getDailyCollection(tenantId: string, days = 7) {
    const results = await Promise.all(
      Array.from({ length: days }, (_, i) => {
        const day = subDays(new Date(), days - 1 - i);
        const from = startOfDay(day).toISOString();
        const to = endOfDay(day).toISOString();
        const fecha = format(day, 'd MMM');
        return supabase
          .from('debt_details')
          .select('total, contacts!inner(tenant_id)')
          .eq('debt_status', 'Paid')
          .eq('contacts.tenant_id', tenantId)
          .gte('updated_at', from)
          .lte('updated_at', to)
          .then(({ data }) => ({
            fecha,
            monto: (data ?? []).reduce((s, d) => s + Number(d.total), 0),
          }));
      })
    );
    return results;
  },

  /** Client status distribution */
  async getClientStatusDistribution(tenantId: string) {
    const { data, error } = await supabase
      .from('debts')
      .select('debt_status')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.debt_status] = (counts[row.debt_status] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);

    const statusLabels: Record<string, string> = {
      Pending: 'Pendiente',
      Active:  'En seguimiento',
      Paid:    'Pagado',
      Expired: 'Vencido',
    };

    return Object.entries(counts).map(([status, cantidad]) => ({
      estado: statusLabels[status] ?? status,
      cantidad,
      porcentaje: total > 0 ? Math.round((cantidad / total) * 1000) / 10 : 0,
    }));
  },
};
