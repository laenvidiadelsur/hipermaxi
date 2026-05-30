import { supabase } from "../../lib/supabase";
import { getAdminApiBase } from "./admin.service";
import type { NotificationPreference } from "../data/supabase.types";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationItem = {
  id: string;
  tenant_id: string;
  user_id: string;
  event_id: string | null;
  title: string;
  body: string;
  severity: NotificationSeverity;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export const notificationsService = {
  async getNotifications(tenantId: string, limit = 20, offset = 0) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(`${adminUrl}/api/notifications?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error obteniendo notificaciones");
    return json as { success: boolean; items: NotificationItem[]; total: number; limit: number; offset: number };
  },

  async getUnreadCount(tenantId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error obteniendo no le�das");
    return json as { success: boolean; unread_count: number };
  },

  async markRead(tenantId: string, notificationId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error marcando notificaci�n");
    return json as { success: boolean };
  },

  async markAllRead(tenantId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/notifications/read-all`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error marcando todo como le�do");
    return json as { success: boolean };
  },

  async getPreferences(tenantId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/notifications/preferences`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error cargando preferencias");
    return json as { success: boolean; items: NotificationPreference[] };
  },

  async savePreferences(
    tenantId: string,
    items: Array<{ event_type: string; enabled_in_app: boolean; enabled_email?: boolean }>
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No active session");
    const adminUrl = getAdminApiBase();
    const res = await fetch(`${adminUrl}/api/notifications/preferences`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error guardando preferencias");
    return json as { success: boolean; updated: number };
  },
};
