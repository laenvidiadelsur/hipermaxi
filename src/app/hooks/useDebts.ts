import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { debtsService, type DebtFilters } from '../services/debts.service';
import { useAuth } from '../context/AuthContext';

export const DEBTS_KEY = 'debts';

export function useDebtDetails(filters?: DebtFilters) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DEBTS_KEY, 'details', tenantId, filters],
    queryFn: () => debtsService.getDetails(tenantId!, filters),
    enabled: !!tenantId,
  });
}

export function useDebtsSummary() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DEBTS_KEY, 'summary', tenantId],
    queryFn: () => debtsService.getSummary(tenantId!),
    enabled: !!tenantId,
  });
}

export function useImportDebts() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Parameters<typeof debtsService.importBatch>[1]) =>
      debtsService.importBatch(tenantId!, rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DEBTS_KEY] }),
  });
}
