import { supabase } from '../../lib/supabase';
import type { Database, Debt, DebtDetail, DebtDetailWithContact, DebtStatus } from '../data/supabase.types';

type DebtDetailInsert = Database['public']['Tables']['debt_details']['Insert'];
type DebtInsert = Database['public']['Tables']['debts']['Insert'];

export interface DebtFilters {
  status?: DebtStatus | 'all';
  search?: string;
  sortBy?: 'expiration_date_asc' | 'expiration_date_desc' | 'amount_asc' | 'amount_desc' | 'name_asc';
}

export const debtsService = {
  // ── Debt Details ────────────────────────────────────────────

  /** Get debt details with contact info, optional filters */
  async getDetails(tenantId: string, filters?: DebtFilters): Promise<DebtDetailWithContact[]> {
    let query = supabase
      .from('debt_details')
      .select(`
        *,
        contacts!inner(name, phone_number, email, tenant_id)
      `)
      .eq('contacts.tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('debt_status', filters.status);
    }

    if (filters?.search) {
      const term = `%${filters.search}%`;
      query = query.or(`debt_description.ilike.${term},contacts.name.ilike.${term},contacts.phone_number.ilike.${term}`);
    }

    // Sorting
    switch (filters?.sortBy) {
      case 'expiration_date_asc':
        query = query.order('expiration_date', { ascending: true }); break;
      case 'amount_desc':
        query = query.order('total', { ascending: false }); break;
      case 'amount_asc':
        query = query.order('total', { ascending: true }); break;
      case 'name_asc':
        query = query.order('name', { referencedTable: 'contacts', ascending: true }); break;
      default:
        query = query.order('expiration_date', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    return (data ?? []).map(row => {
      const exp = new Date(row.expiration_date).getTime();
      const daysOverdue = exp < now ? Math.floor((now - exp) / (1000 * 60 * 60 * 24)) : 0;
      return { ...row, days_overdue: daysOverdue } as DebtDetailWithContact;
    });
  },

  // ── Debts aggregate ─────────────────────────────────────────

  /** Summary stats (used in list page stats cards) */
  async getSummary(tenantId: string) {
    const { data, error } = await supabase
      .from('debts')
      .select('debt_count, debt_paid_count, debt_pending_count, total_debt, total_paid, total_pending, contact_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (error) throw error;

    return {
      totalDeudas: data.reduce((s, r) => s + r.debt_count, 0),
      totalAdeudado: data.reduce((s, r) => s + Number(r.total_pending), 0),
      deudasVencidas: 0, // computed from debt_details below if needed
      clientesConDeuda: new Set(data.filter(r => r.total_pending > 0).map(r => r.contact_id)).size,
    };
  },

  /** Get debt aggregate per contact (for grouped view) */
  async getByContact(tenantId: string): Promise<Debt[]> {
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (error) throw error;
    return data ?? [];
  },

  // ── Import ──────────────────────────────────────────────────

  /** Batch import debt details from Excel parsed rows */
  async importBatch(tenantId: string, rows: Array<{
    contactId: string;
    debtId: string;
    debtAmount: number;
    penaltyAmount: number;
    total: number;
    description: string;
    expirationDate: string;
    createdBy: string;
  }>): Promise<void> {
    const inserts: DebtDetailInsert[] = rows.map(r => ({
      contact_id: r.contactId,
      debt_id: r.debtId,
      debt_amount: r.debtAmount,
      penalty_amount: r.penaltyAmount,
      total: r.total,
      debt_description: r.description,
      expiration_date: r.expirationDate,
      debt_status: 'Pending',
      created_by: r.createdBy,
      updated_by: r.createdBy,
    }));

    const { error } = await supabase.from('debt_details').insert(inserts);
    if (error) throw error;
  },

  /** Update status of a debt detail */
  async updateStatus(id: string, status: DebtStatus, updatedBy: string): Promise<void> {
    const { error } = await supabase
      .from('debt_details')
      .update({ debt_status: status, updated_by: updatedBy })
      .eq('id', id);
    if (error) throw error;
  },
};
