import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import NotificationItem from "./NotificationItem";
import type { NotificationItem as NotificationItemType } from "../../services/notifications.service";

type NotificationDropdownProps = {
  items: NotificationItemType[];
  isLoading: boolean;
  onMarkAllRead: () => void;
  onNotificationClick: (item: NotificationItemType) => void;
};

export default function NotificationDropdown({
  items,
  isLoading,
  onMarkAllRead,
  onNotificationClick,
}: NotificationDropdownProps) {
  return (
    <div className="w-[380px] p-2">
      <div className="flex items-center justify-between px-1 py-1.5">
        <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onMarkAllRead}>
          Marcar todo leido
        </Button>
      </div>
      <div className="max-h-[420px] overflow-y-auto space-y-2 p-1" aria-live="polite">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No tienes notificaciones</div>
        ) : (
          items.map((item) => (
            <NotificationItem key={item.id} item={item} onClick={onNotificationClick} />
          ))
        )}
      </div>
    </div>
  );
}