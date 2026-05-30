import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactsService } from '../services/contacts.service';
import { useAuth } from '../context/AuthContext';

export const CONTACTS_KEY = 'contacts';

export function useContacts() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CONTACTS_KEY, tenantId],
    queryFn: () => contactsService.getAll(tenantId!),
    enabled: !!tenantId,
  });
}

export function useContactStats() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CONTACTS_KEY, 'stats', tenantId],
    queryFn: () => contactsService.getStats(tenantId!),
    enabled: !!tenantId,
  });
}

export function useCreateContact() {
  const { tenantId, dbUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; phone_number?: string; email?: string }) =>
      contactsService.create({
        name: payload.name,
        phone_number: payload.phone_number ?? null,
        email: payload.email ?? null,
        last_interaction: null,
        deleted_at: null,
        deleted_by: null,
        tenant_id: tenantId!,
        created_by: dbUser?.id ?? null,
        updated_by: dbUser?.id ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CONTACTS_KEY, tenantId] }),
  });
}

export function useUpdateContact() {
  const { tenantId, dbUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; phone_number?: string | null; email?: string | null } }) =>
      contactsService.update(id, {
        name: payload.name,
        phone_number: payload.phone_number ?? null,
        email: payload.email ?? null,
        updated_by: dbUser?.id ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CONTACTS_KEY, tenantId] }),
  });
}

export function useDeleteContact() {
  const { tenantId, dbUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contactsService.softDelete(id, dbUser?.id ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CONTACTS_KEY, tenantId] }),
  });
}
