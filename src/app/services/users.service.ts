import { supabase } from '../../lib/supabase';
import type { Database, DbUser } from '../data/supabase.types';

type UserInsert = Database['public']['Tables']['users']['Insert'];
type UserUpdate  = Database['public']['Tables']['users']['Update'];

export const usersService = {
  /** All non-deleted users for a tenant */
  async getAll(tenantId: string): Promise<DbUser[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  /** Create user via Supabase Auth + insert profile row */
  async create(payload: { name: string; email: string; password: string; role: DbUser['role']; tenantId: string; createdBy: string }) {
    // 1. Create auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // 2. Insert profile row
    const insert: UserInsert = {
      id: authData.user.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      tenant_id: payload.tenantId,
      enabled: true,
      created_by: payload.createdBy,
      updated_by: payload.createdBy,
    };
    const { data, error } = await supabase.from('users').insert(insert).select().single();
    if (error) throw error;
    return data;
  },

  /** Update profile fields */
  async update(id: string, payload: UserUpdate): Promise<DbUser> {
    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Toggle enabled state */
  async toggleEnabled(id: string, currentEnabled: boolean, updatedBy: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ enabled: !currentEnabled, updated_by: updatedBy })
      .eq('id', id);
    if (error) throw error;
  },

  /** Soft-delete */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq('id', id);
    if (error) throw error;
  },
};
