# Notifications Rollout Checklist

## Scope
- Bell + dropdown UI in main layout.
- Backend notifications API with tenant/user/role guards.
- Supabase Realtime delivery for per-user notifications.
- Notification preferences by event type.

## Functional checks
- User only sees own notifications for active workspace tenant.
- Unread badge updates when new notifications are inserted.
- `Mark as read` and `Mark all as read` update list and unread counter.
- Clicking an item navigates to its `action_url`.
- Empty state renders when there are no notifications.

## Multi-tenant and role checks
- User in tenant A does not receive notifications from tenant B.
- Admin/Superadmin receive `mass_send_failed` events for their tenant.
- Agente/Admin receive `thread_inbound_message` events.
- Debt threshold check emits only within selected tenant.

## Realtime checks
- Open two sessions with same user and tenant: insert notification, both sessions update.
- Open sessions with different users: only target user receives update.
- Reconnect behavior: after refresh, list and unread count are consistent.

## Failure checks
- Invalid/missing auth token on notifications endpoints returns 401.
- Missing `x-tenant-id` returns 400.
- Non-member access returns 403.

## Release checks
- Apply migration `20260411000001_notifications_bell_realtime.sql`.
- Regenerate/deploy backend and frontend.
- Validate with one synthetic event per type:
  - `mass_send_failed`
  - `thread_inbound_message`
  - `debt_overdue_threshold`
