import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { DbUser, UserRole } from '../data/supabase.types';
import { bootstrapAuthProfile } from '../services/admin.service';

export interface Workspace {
  id: string;
  name: string;
  role: UserRole;
  enabled: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  dbUser: DbUser | null;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeRole: UserRole | null;
  tenantId: string | null;
  hasWorkspaceAccess: boolean;
  isLoading: boolean;
  bootstrapError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aicobranzas-active-workspace';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const hasLoadedAuthStateRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadAuthState(session.user.id);
      else setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        // Avoid global loading flashes when returning to a focused tab.
        // TOKEN_REFRESHED is frequent and does not require reloading full app profile/workspaces.
        if (event === 'TOKEN_REFRESHED') return;
        loadAuthState(session.user.id);
      } else {
        setDbUser(null);
        setWorkspaces([]);
        setActiveWorkspaceId(null);
        setBootstrapError(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadAuthState(authUserId: string) {
    const shouldShowGlobalLoader = !hasLoadedAuthStateRef.current;
    if (shouldShowGlobalLoader) setIsLoading(true);
    setBootstrapError(null);
    let bootstrapFailed = false;
    try {
      let profileData: DbUser | null = null;
      let profileError: { code?: string; message?: string } | null = null;

      const firstProfile = await supabase.from('users').select('*').eq('id', authUserId).is('deleted_at', null).maybeSingle();
      profileError = firstProfile.error;
      profileData = firstProfile.data ?? null;

      if (profileError) console.warn('[AuthContext] loadDbUser error:', profileError.code, profileError.message);

      if (!profileData) {
        try {
          await bootstrapAuthProfile();
          const second = await supabase.from('users').select('*').eq('id', authUserId).is('deleted_at', null).maybeSingle();
          profileError = second.error;
          profileData = second.data ?? null;
          if (second.error) console.warn('[AuthContext] loadDbUser after bootstrap:', second.error.code, second.error.message);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Bootstrap failed';
          console.warn('[AuthContext] bootstrap error:', msg);
          bootstrapFailed = true;
          setBootstrapError(msg);
        }
      }

      // Avoid infinite "Preparando tu cuenta..." when bootstrap doesn't create/read profile.
      if (!profileData && !bootstrapFailed) {
        setBootstrapError('No se pudo cargar tu perfil de aplicación. Contacta al administrador.');
      }

      setDbUser(profileData ?? null);

      const { data: membershipsData, error: membershipsError } = await (supabase as any)
        .from('tenant_members')
        .select('tenant_id, role, enabled, tenants(id, name)')
        .eq('user_id', authUserId)
        .eq('enabled', true);

      if (membershipsError) {
        console.warn('[AuthContext] load memberships error:', membershipsError.code, membershipsError.message);
        setWorkspaces([]);
        setActiveWorkspaceId(null);
      } else {
        const mapped: Workspace[] = (membershipsData ?? [])
          .map((m: any) => {
            const tenant = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
            if (!tenant?.id || !tenant?.name) return null;
            return { id: tenant.id, name: tenant.name, role: m.role, enabled: m.enabled };
          })
          .filter((x: Workspace | null): x is Workspace => Boolean(x));

        setWorkspaces(mapped);
        const persisted = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        const validPersisted = persisted && mapped.some((w) => w.id === persisted);
        const nextWorkspaceId = validPersisted ? persisted : (mapped[0]?.id ?? null);
        setActiveWorkspaceId(nextWorkspaceId);
        if (nextWorkspaceId) window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, nextWorkspaceId);
        else window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      }
    } catch (err) {
      console.error('[AuthContext] Unexpected error loading auth state:', err);
      setDbUser(null);
      setWorkspaces([]);
      setActiveWorkspaceId(null);
    } finally {
      hasLoadedAuthStateRef.current = true;
      if (shouldShowGlobalLoader) setIsLoading(false);
    }
  }

  function switchWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setDbUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setSession(null);
    setBootstrapError(null);
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }

  const activeRole = workspaces.find((w) => w.id === activeWorkspaceId)?.role ?? null;
  const hasWorkspaceAccess = workspaces.length > 0;

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    dbUser,
    workspaces,
    activeWorkspaceId,
    activeRole,
    tenantId: activeWorkspaceId,
    hasWorkspaceAccess,
    isLoading,
    bootstrapError,
    signIn,
    signOut,
    switchWorkspace,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
