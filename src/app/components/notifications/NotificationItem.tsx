import { AlertCircle, Bell, CircleAlert } from "lucide-react";
import type { NotificationItem as NotificationItemType } from "../../services/notifications.service";

type NotificationItemProps = {
  item: NotificationItemType;
  onClick: (item: NotificationItemType) => void;
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function NotificationItem({ item, onClick }: NotificationItemProps) {
  const Icon = item.severity === "critical" ? CircleAlert : item.severity === "warning" ? AlertCircle : Bell;
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={`w-full text-left rounded-md border p-3 transition-colors ${
        item.is_read ? "bg-white border-slate-200 hover:bg-slate-50" : "bg-blue-50 border-blue-200 hover:bg-blue-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className="size-4 mt-0.5 text-slate-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.body}</p>
          <p className="text-[10px] text-slate-400 mt-1">{relativeTime(item.created_at)}</p>
        </div>
        {!item.is_read ? <span className="size-2 rounded-full bg-blue-600 mt-1.5" aria-hidden="true" /> : null}
      </div>
    </button>
  );
}