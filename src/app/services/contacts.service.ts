import { supabase } from '../../lib/supabase';
import type { Database, Contact } from '../data/supabase.types';

type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

export const contactsService = {
  /** Fetch all active contacts for a tenant */
  async getAll(tenantId: string): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name');

    if (error) throw error;
    return data ?? [];
  },

  /** Fetch single contact */
  async getById(id: string): Promise<Contact | null> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  /** Stats: total, active (interacted in last 7 days), last 24h */
  async getStats(tenantId: string) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, last_interaction')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    if (error) throw error;

    const now = Date.now();
    const DAY = 1000 * 60 * 60 * 24;
    return {
      total: data.length,
      activeLastWeek: data.filter(c => c.last_interaction && now - new Date(c.last_interaction).getTime() <= 7 * DAY).length,
      activeLast24h:  data.filter(c => c.last_interaction && now - new Date(c.last_interaction).getTime() <= DAY).length,
    };
  },

  /** Create a new contact */
  async create(payload: ContactInsert): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Update a contact */
  async update(id: string, payload: ContactUpdate): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Soft-delete */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq('id', id);
    if (error) throw error;
  },
};
