import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { notificationsService } from "../services/notifications.service";
import { supabase } from "../../lib/supabase";

export const NOTIFICATIONS_KEY = "notifications";
export const NOTIFICATIONS_UNREAD_KEY = "notifications-unread-count";
export const NOTIFICATIONS_PREFS_KEY = "notifications-preferences";

export function useNotifications(limit = 20, offset = 0) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, tenantId, limit, offset],
    queryFn: async () => (await notificationsService.getNotifications(tenantId!, limit, offset)).items,
    enabled: !!tenantId,
  });
}

export function useUnreadNotificationsCount() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [NOTIFICATIONS_UNREAD_KEY, tenantId],
    queryFn: async () => (await notificationsService.getUnreadCount(tenantId!)).unread_count,
    enabled: !!tenantId,
  });
}

export function useMarkNotificationRead() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsService.markRead(tenantId!, notificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, tenantId] });
      qc.invalidateQueries({ queryKey: [NOTIFICATIONS_UNREAD_KEY, tenantId] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(tenantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, tenantId] });
      qc.invalidateQueries({ queryKey: [NOTIFICATIONS_UNREAD_KEY, tenantId] });
    },
  });
}

export function useNotificationPreferences() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [NOTIFICATIONS_PREFS_KEY, tenantId],
    queryFn: async () => (await notificationsService.getPreferences(tenantId!)).items,
    enabled: !!tenantId,
  });
}

export function useSaveNotificationPreferences() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ event_type: string; enabled_in_app: boolean; enabled_email?: boolean }>) =>
      notificationsService.savePreferences(tenantId!, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOTIFICATIONS_PREFS_KEY, tenantId] }),
  });
}

export function useNotificationsRealtime() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!tenantId || !user?.id) return;
    const channel = supabase
      .channel(`notifications:${tenantId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const created = payload.new as { user_id?: string } | null;
          if (created?.user_id !== user.id) return;
          qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, tenantId] });
          qc.invalidateQueries({ queryKey: [NOTIFICATIONS_UNREAD_KEY, tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, user?.id, qc]);
}