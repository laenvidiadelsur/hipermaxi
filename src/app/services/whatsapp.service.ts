import { supabase } from '../../lib/supabase';
import { getAdminApiBase } from './admin.service';
import type { Database, WhatsappConfiguration, WhatsappTemplate, Contact } from '../data/supabase.types';

type TemplateInsert = Database['public']['Tables']['whatsapp_templates']['Insert'];

export interface MessagingMetricsFilters {
  from: string;
  to: string;
  conversation_state?: 'all' | 'activo' | 'pendiente' | 'resuelto';
  message_type?: 'all' | 'text' | 'template';
  window_state?: 'all' | 'open' | 'closed';
  template?: string;
  search?: string;
}

export interface MessagingMetricsResponse {
  success: boolean;
  kpis: {
    sent_messages: number;
    responded_messages: number;
    response_rate: number;
    templates_sent: number;
    active_conversations: number;
    closed_window_conversations: number;
    mass_sent_messages?: number;
    mass_send_runs?: number;
  };
  timeseries: Array<{ day: string; sent: number; responded: number }>;
  template_stats: Array<{ template_name: string; sent: number }>;
  top_contacts: Array<{ thread_id: string; contact_name: string; phone_number: string | null; total: number }>;
  top_mass_sends?: Array<{ name: string; sent: number; failed: number }>;
  conversation_stats: { activo: number; pendiente: number; resuelto: number };
  detail: Array<{
    id: string;
    created_at: string;
    thread_id: string;
    contact_name: string;
    phone_number: string | null;
    direction: 'inbound' | 'outbound';
    message_type: 'text' | 'template';
    template_name: string | null;
    read: boolean;
    preview: string;
    window_open: boolean;
    conversation_state: 'activo' | 'pendiente' | 'resuelto';
  }>;
}

export interface MassSendFilters {
  min_days_overdue?: number | null;
  max_days_overdue?: number | null;
  min_amount_due?: number | null;
  max_amount_due?: number | null;
  debt_status?: string | null;
  included_contact_ids?: string[];
  excluded_contact_ids?: string[];
}

export interface MassSend {
  id: string;
  name: string;
  template_name: string;
  language: string;
  mode: 'manual' | 'scheduled';
  status: 'draft' | 'active' | 'paused' | 'completed';
  filters: MassSendFilters;
  created_at: string;
  updated_at: string;
  last_run?: {
    id: string;
    status: 'running' | 'completed' | 'failed';
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    started_at: string;
    finished_at: string | null;
  } | null;
}

export const whatsappService = {
  // ── Configurations ──────────────────────────────────────────

  /** Get WhatsApp config for tenant (one per tenant) */
  async getConfiguration(tenantId: string): Promise<WhatsappConfiguration | null> {
    const { data, error } = await supabase
      .from('whatsapp_configurations')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Upsert WhatsApp configuration */
  async saveConfiguration(
    tenantId: string,
    payload: {
      channel_name?: string;
      meta_id: string;
      waba_id: string;
      phone_number_id?: string;
      token: string;
      verify_token?: string;
      default_template_language?: string;
    }
  ): Promise<WhatsappConfiguration> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/configurations/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = typeof json?.detail === 'string' ? `: ${json.detail}` : '';
      throw new Error((json.error || 'Error validando y guardando configuración') + detail);
    }
    return json.configuration as WhatsappConfiguration;
  },

  // ── Templates ───────────────────────────────────────────────

  /** All templates for a tenant (joins through whatsapp_configurations) */
  async getTemplates(tenantId: string): Promise<WhatsappTemplate[]> {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*, whatsapp_configurations!inner(tenant_id)')
      .eq('whatsapp_configurations.tenant_id', tenantId)
      .is('deleted_at', null)
      .order('template_name');
    if (error) throw error;
    return (data ?? []) as WhatsappTemplate[];
  },

  async getApprovedTemplates(tenantId: string): Promise<WhatsappTemplate[]> {
    const templates = await this.getTemplates(tenantId);
    return templates.filter((template) => String(template.meta_status).toUpperCase() === 'APPROVED');
  },

  /** Create a template */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createTemplate(payload: TemplateInsert): Promise<WhatsappTemplate> {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .insert(payload as any) // Cast: Supabase client schema lags behind local types until migration is applied
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Create Meta template through backend proxy */
  async createMetaTemplate(
    tenantId: string,
    payload: {
      name: string;
      language: string;
      category: string;
      template_type?: 'STANDARD' | 'CAROUSEL' | 'FLOW';
      components: Array<Record<string, unknown>>;
      args?: string[];
    }
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/templates/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error creando plantilla');
    return json as WhatsappTemplate;
  },

  /** Validate/normalize Meta template through backend proxy (no remote call) */
  async validateMetaTemplate(
    tenantId: string,
    payload: {
      name: string;
      language?: string;
      category: string;
      template_type?: 'STANDARD' | 'CAROUSEL' | 'FLOW';
      components: Array<Record<string, unknown>>;
    }
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/templates/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.detail || 'Error validando plantilla');
    return json as {
      success: boolean;
      normalized: {
        name: string;
        language: string;
        category: string;
        template_type: string;
        header_format: string;
        components: Array<Record<string, unknown>>;
      };
    };
  },

  /** Sync Meta template statuses through backend proxy */
  async syncMetaTemplates(tenantId: string, mode: 'pending' | 'all' = 'pending') {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/templates/sync?mode=${encodeURIComponent(mode)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error sincronizando plantillas');
    return json as { success: boolean; synced: number; imported?: number; total_remote: number; total_local: number };
  },

  /** Send a free-text message to a contact via Meta proxy */
  async sendMessage(
    tenantId: string,
    payload: { phone_number: string; message_text: string; thread_id?: string }
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.message || json.error || 'Error enviando mensaje') as Error & {
        code?: string;
        window_open?: boolean;
      };
      err.code = json.error;
      err.window_open = json.window_open;
      throw err;
    }
    return json as { success: boolean; message?: Record<string, unknown> };
  },

  async sendTemplateMessage(
    tenantId: string,
    payload: {
      phone_number: string;
      template_id?: string;
      template_name?: string;
      language?: string;
      template_parameters?: string[];
      thread_id?: string;
    }
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const res = await fetch(`${adminUrl}/api/meta/messages/send-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || 'Error enviando plantilla');
    return json as { success: boolean; message?: Record<string, unknown>; template_name?: string };
  },

  async getMessagingMetrics(tenantId: string, filters: MessagingMetricsFilters) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();

    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      conversation_state: filters.conversation_state || 'all',
      message_type: filters.message_type || 'all',
      window_state: filters.window_state || 'all',
    });
    if (filters.template) params.set('template', filters.template);
    if (filters.search) params.set('search', filters.search);

    const res = await fetch(`${adminUrl}/api/meta/metrics?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error obteniendo métricas de mensajería');
    return json as MessagingMetricsResponse;
  },

  async previewMassSend(
    tenantId: string,
    filters: MassSendFilters
  ): Promise<{
    success: boolean;
    total_recipients: number;
    sample: Array<{
      contact_id: string;
      phone_number: string;
      contact_name: string;
      total_pending: number;
      debt_status: string;
      max_days_overdue: number;
    }>;
    applied_filters: MassSendFilters;
  }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/meta/mass-sends/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ filters }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error previsualizando envío masivo');
    return json;
  },

  async createMassSend(
    tenantId: string,
    payload: {
      name: string;
      template_id?: string;
      template_name?: string;
      language?: string;
      template_parameters?: string[];
      filters?: MassSendFilters;
      mode?: 'manual' | 'scheduled';
      schedule?: {
        cron_expression: string;
        timezone?: string;
        next_run_at?: string | null;
        enabled?: boolean;
      } | null;
    }
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/meta/mass-sends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error creando envío masivo');
    return json as { success: boolean; mass_send: MassSend };
  },

  async runMassSend(tenantId: string, massSendId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/meta/mass-sends/${massSendId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ trigger_type: 'manual' }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error ejecutando envío masivo');
    return json as {
      success: boolean;
      run_id: string;
      summary: { total_recipients: number; sent: number; failed: number; skipped: number };
      failed_samples?: Array<{ phone_number: string; error_message: string }>;
    };
  },

  async getMassSends(tenantId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session');
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/meta/mass-sends`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error listando envíos masivos');
    return json as { success: boolean; items: MassSend[] };
  },

  /** Search contacts by name or phone within a tenant */
  async searchContacts(tenantId: string, query: string): Promise<Contact[]> {
    const q = `%${query}%`;
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(`name.ilike.${q},phone_number.ilike.${q}`)
      .limit(10);
    if (error) throw error;
    return data ?? [];
  },
};
