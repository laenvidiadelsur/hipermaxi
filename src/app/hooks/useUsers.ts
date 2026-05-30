import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService } from '../services/users.service';
import { useAuth } from '../context/AuthContext';
import type { DbUser } from '../data/supabase.types';

export const USERS_KEY = 'users';

export function useUsers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [USERS_KEY, tenantId],
    queryFn: () => usersService.getAll(tenantId!),
    enabled: !!tenantId,
  });
}

export function useToggleUser() {
  const { dbUser, tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, currentEnabled }: { id: string; currentEnabled: boolean }) =>
      usersService.toggleEnabled(id, currentEnabled, dbUser?.id ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: [USERS_KEY, tenantId] }),
  });
}

export function useUpdateUser() {
  const { tenantId, dbUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Pick<DbUser, 'name' | 'email' | 'role'>> }) =>
      usersService.update(id, { ...payload, updated_by: dbUser?.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [USERS_KEY, tenantId] }),
  });
}
