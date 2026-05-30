import React from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import NotificationDropdown from "./NotificationDropdown";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
  useUnreadNotificationsCount,
} from "../../hooks/useNotifications";
import type { NotificationItem } from "../../services/notifications.service";

export default function NotificationBell() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useNotifications(20, 0);
  const { data: unread = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  useNotificationsRealtime();

  const onClickNotification = (item: NotificationItem) => {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.action_url) navigate(item.action_url);
  };

  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Abrir notificaciones"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-auto">
        <NotificationDropdown
          items={items}
          isLoading={isLoading}
          onMarkAllRead={() =>
            markAll.mutate(undefined, {
              onError: (err) => toast.error((err as Error).message),
            })
          }
          onNotificationClick={onClickNotification}
        />
      </PopoverContent>
    </Popover>
  );
}