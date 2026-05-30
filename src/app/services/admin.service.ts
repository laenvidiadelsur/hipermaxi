import { supabase } from '../../lib/supabase';

/** Empty string = same origin (Vercel rewrites + dev proxy). Set VITE_ADMIN_SERVER_URL if API is on another host. */
export function getAdminApiBase(): string {
  const raw = (import.meta as unknown as { env: Record<string, string | undefined> }).env
    .VITE_ADMIN_SERVER_URL;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().replace(/\/$/, '');
  }
  return '';
}

const adminBase = () => getAdminApiBase();

/** Get auth header from current Supabase session */
async function getAuthHeader(): Promise<{ Authorization: string }> {
  const isJwtLike = (token: string | undefined | null) =>
    typeof token === 'string' && token.split('.').length === 3;

  let { data: { session } } = await supabase.auth.getSession();

  // Some reset/migration flows can leave a stale malformed token in local storage.
  // Try one refresh before failing hard.
  if (!session || !isJwtLike(session.access_token)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed?.session || !isJwtLike(refreshed.session.access_token)) {
      throw new Error('Sesion invalida. Cierra sesion y vuelve a iniciar para obtener un token valido.');
    }
    session = refreshed.session;
  }

  return { Authorization: `Bearer ${session.access_token}` };
}

/** Ensure public.users row exists for the current Supabase Auth user (OAuth or password). */
export async function bootstrapAuthProfile(): Promise<{ created: boolean }> {
  const headers = await getAuthHeader();
  const res = await fetch(`${adminBase()}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const detail = typeof (json as any)?.detail === 'string' ? (json as any).detail : null;
    const ref = typeof (json as any)?.supabaseRef === 'string' ? (json as any).supabaseRef : null;
    const msg = [json.error, detail, ref ? `ref=${ref}` : null].filter(Boolean).join(' — ');
    throw new Error(msg || `Bootstrap failed (${res.status})`);
  }
  return json as { created: boolean };
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${adminBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

async function adminTenantFetch<T>(tenantId: string, path: string, options?: RequestInit): Promise<T> {
  return adminFetch<T>(path, {
    ...options,
    headers: { 'x-tenant-id': tenantId, ...(options?.headers ?? {}) },
  });
}

export type InviteRole = 'Admin' | 'Agente';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface TenantInviteItem {
  id: string;
  tenant_id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ── Tenants ───────────────────────────────────────────────────
export const adminTenantsService = {
  getAll: () => adminFetch<any[]>('/admin/tenants'),
  create: (body: { name: string; nit?: string; address?: string }) =>
    adminFetch('/admin/tenants', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; nit?: string; address?: string }) =>
    adminFetch(`/admin/tenants/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    adminFetch(`/admin/tenants/${id}`, { method: 'DELETE' }),
};

// ── Users (global) ────────────────────────────────────────────
export const adminUsersService = {
  create: (body: { email: string; password: string; name: string; role: string; tenant_id: string }) =>
    adminFetch('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) =>
    adminFetch(`/admin/users/${id}`, { method: 'DELETE' }),
};

// ── Subscriptions ────────────────────────────────────────────
export const adminSubscriptionsService = {
  getAll:  () => adminFetch<any[]>('/admin/subscriptions'),
  getPlans: () => adminFetch<any[]>('/admin/plans'),
  create: (body: { tenant_id: string; subscription_plan_id: string; price: number; expiration_date: string }) =>
    adminFetch('/admin/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  toggle: (id: string) =>
    adminFetch(`/admin/subscriptions/${id}/toggle`, { method: 'PATCH' }),
};

// ── Users (all tenants — read via anon key, RLS allows Superadmin) ──
export const adminUsersReadService = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*, tenants(name)')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },
};

// ── Invites (workspace scoped) ─────────────────────────────────
export const adminInvitesService = {
  list: (tenantId: string, status: 'all' | InviteStatus = 'all') => {
    const query = new URLSearchParams();
    if (status !== 'all') query.set('status', status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminTenantFetch<{ items: TenantInviteItem[] }>(tenantId, `/admin/invites${suffix}`);
  },
  create: (tenantId: string, body: { email: string; role: InviteRole }) =>
    adminTenantFetch<TenantInviteItem & { invite_url?: string; email_sent?: boolean; email_error?: string }>(
      tenantId,
      '/admin/invites',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  resend: (tenantId: string, inviteId: string) =>
    adminTenantFetch<{ success: boolean; invite_url?: string; email_sent?: boolean; email_error?: string }>(
      tenantId,
      `/admin/invites/${inviteId}/resend`,
      { method: 'POST' }
    ),
  revoke: (tenantId: string, inviteId: string) =>
    adminTenantFetch<{ success: boolean }>(tenantId, `/admin/invites/${inviteId}`, { method: 'DELETE' }),
};

// ── Debts (tenant scoped via admin API) ───────────────────────
export type CreateDebtItem = {
  amount: number;
  penalty?: number;
  total?: number;
  description?: string;
  expiration_date: string; // YYYY-MM-DD
};

export const adminDebtsService = {
  create: (tenantId: string, body: { contactId?: string; contact?: { name?: string; phone_number?: string; email?: string }; items: CreateDebtItem[] }) =>
    adminTenantFetch<{ success: boolean; debt_id: string }>(tenantId, '/api/debts/create', { method: 'POST', body: JSON.stringify(body) }),
  import: (tenantId: string, body: { rows: Array<{ name?: string; phone_number?: string; email?: string; amount: number; penalty?: number; total?: number; description?: string; expiration_date: string }> }) =>
    adminTenantFetch<{
      success: boolean;
      created_contacts: number;
      created_items: number;
      invalid_rows: Array<{ row: number; raw_phone: string | null; normalized_phone: string | null; reason: string }>;
      errors: Array<{ row: number; error: string }>;
    }>(tenantId, '/api/debts/import', { method: 'POST', body: JSON.stringify(body) }),
};
