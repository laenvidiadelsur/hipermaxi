import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../data/supabase.types";

interface Props {
  children: React.ReactNode;
  requiredRole?: UserRole;
  roleScope?: "tenant" | "global";
}

export default function ProtectedRoute({ children, requiredRole, roleScope = "tenant" }: Props) {
  const { session, dbUser, activeRole, activeWorkspaceId, isLoading } = useAuth();

  if (isLoading) return <div className="p-8 text-center">Cargando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (session && !dbUser) return <div className="p-8 text-center">Preparando tu cuenta…</div>;
  if (dbUser && !dbUser.enabled) return <Navigate to="/login" replace />;

  const ROLE_HIERARCHY: Record<UserRole, number> = { Superadmin: 3, Admin: 2, Agente: 1 };
  const effectiveRole = roleScope === "global" ? dbUser?.role ?? null : activeRole ?? null;

  if (requiredRole && !effectiveRole) {
    if (roleScope === "tenant" && !activeWorkspaceId) {
      return <div className="p-8 text-center">No tienes un workspace activo asignado.</div>;
    }
    return <Navigate to="/cobranzas" replace />;
  }

  if (requiredRole && effectiveRole && ROLE_HIERARCHY[effectiveRole] < ROLE_HIERARCHY[requiredRole]) {
    return <Navigate to="/cobranzas" replace />;
  }

  return <>{children}</>;
}
