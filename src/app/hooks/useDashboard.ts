import { useQuery } from '@tanstack/react-query';
import { dashboardService, type DateRangeKey } from '../services/dashboard.service';
import { useAuth } from '../context/AuthContext';

export const DASH_KEY = 'dashboard';

export function useCobranzasKPIs(range: DateRangeKey) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DASH_KEY, 'kpis', tenantId, range],
    queryFn: () => dashboardService.getKPIs(tenantId!, range),
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // KPIs: 5 min cache
  });
}

export function useWeeklyActivity() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DASH_KEY, 'weekly', tenantId],
    queryFn: () => dashboardService.getWeeklyActivity(tenantId!),
    enabled: !!tenantId,
  });
}

export function useDailyCollection(days = 7) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DASH_KEY, 'daily', tenantId, days],
    queryFn: () => dashboardService.getDailyCollection(tenantId!, days),
    enabled: !!tenantId,
  });
}

export function useClientStatusDistribution() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [DASH_KEY, 'status-dist', tenantId],
    queryFn: () => dashboardService.getClientStatusDistribution(tenantId!),
    enabled: !!tenantId,
  });
}
