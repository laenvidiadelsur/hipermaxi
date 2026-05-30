import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminTenantsService,
  adminUsersService,
  adminSubscriptionsService,
  adminUsersReadService,
  adminInvitesService,
  type InviteRole,
  type InviteStatus,
} from '../services/admin.service';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

// ── Tenants ───────────────────────────────────────────────────

export function useTenants() {
  return useQuery({ queryKey: ['admin', 'tenants'], queryFn: adminTenantsService.getAll });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminTenantsService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }); toast.success('Tenant creado'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; nit?: string; address?: string }) =>
      adminTenantsService.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }); toast.success('Tenant actualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminTenantsService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }); toast.success('Tenant eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── All users (across tenants) ────────────────────────────────

export function useAllUsers() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: adminUsersReadService.getAll });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminUsersService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Usuario creado correctamente'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminUsersService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Usuario eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Subscriptions ────────────────────────────────────────────

export function useAdminSubscriptions() {
  return useQuery({ queryKey: ['admin', 'subscriptions'], queryFn: adminSubscriptionsService.getAll });
}

export function useAdminPlans() {
  return useQuery({ queryKey: ['admin', 'plans'], queryFn: adminSubscriptionsService.getPlans });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminSubscriptionsService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }); toast.success('Suscripción creada'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminSubscriptionsService.toggle,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Invites (workspace-scoped) ─────────────────────────────────

const INVITES_KEY = 'tenant-invites';

export function useInvites(
  status: 'all' | InviteStatus = 'all',
  opts?: { tenantId?: string | null },
) {
  const { tenantId: authTenantId } = useAuth();
  const effectiveTenantId = opts?.tenantId ?? authTenantId;
  return useQuery({
    queryKey: [INVITES_KEY, effectiveTenantId, status],
    queryFn: async () => {
      const data = await adminInvitesService.list(effectiveTenantId!, status);
      return data.items ?? [];
    },
    enabled: !!effectiveTenantId,
  });
}

export function useCreateInvite() {
  const { tenantId: authTenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; role: InviteRole; tenantId?: string }) => {
      const tid = payload.tenantId ?? authTenantId!;
      return adminInvitesService.create(tid, { email: payload.email, role: payload.role });
    },
    onSuccess: (data, variables) => {
      const tid = variables.tenantId ?? authTenantId!;
      qc.invalidateQueries({ queryKey: [INVITES_KEY, tid] });
      if (data.email_sent === false) {
        const inviteUrl = data.invite_url;
        if (inviteUrl) {
          navigator.clipboard?.writeText(inviteUrl).catch(() => {});
          toast.warning(
            `Invitación creada. El correo no pudo enviarse — el enlace fue copiado al portapapeles.`,
            {
              description: inviteUrl,
              duration: 12000,
              action: { label: 'Copiar', onClick: () => navigator.clipboard?.writeText(inviteUrl) },
            }
          );
        } else {
          toast.warning('Invitación creada, pero el correo no pudo enviarse.');
        }
      } else {
        toast.success('Invitación enviada correctamente.');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResendInvite() {
  const { tenantId: authTenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { inviteId: string; tenantId?: string }) => {
      const tid = payload.tenantId ?? authTenantId!;
      return adminInvitesService.resend(tid, payload.inviteId);
    },
    onSuccess: (data, variables) => {
      const tid = variables.tenantId ?? authTenantId!;
      qc.invalidateQueries({ queryKey: [INVITES_KEY, tid] });
      if (data.email_sent === false) {
        const inviteUrl = data.invite_url;
        if (inviteUrl) {
          navigator.clipboard?.writeText(inviteUrl).catch(() => {});
          toast.warning(
            `El correo no pudo enviarse — el enlace fue copiado al portapapeles.`,
            {
              description: inviteUrl,
              duration: 12000,
              action: { label: 'Copiar', onClick: () => navigator.clipboard?.writeText(inviteUrl) },
            }
          );
        } else {
          toast.warning('Se reenvió la invitación, pero el correo falló.');
        }
      } else {
        toast.success('Invitación reenviada.');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeInvite() {
  const { tenantId: authTenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { inviteId: string; tenantId?: string }) => {
      const tid = payload.tenantId ?? authTenantId!;
      return adminInvitesService.revoke(tid, payload.inviteId);
    },
    onSuccess: (_data, variables) => {
      const tid = variables.tenantId ?? authTenantId!;
      qc.invalidateQueries({ queryKey: [INVITES_KEY, tid] });
      toast.success('Invitacion revocada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
