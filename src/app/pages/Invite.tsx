import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Loader2, XCircle, Eye, EyeOff, Building2, ShieldCheck, LogIn } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../../lib/supabase";
import { getAdminApiBase } from "../services/admin.service";

type InviteState = "checking" | "invalid" | "auth" | "accepting" | "accepted";
type AuthMode = "signup" | "login";

export default function InvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token"), [params]);

  const [state, setState] = useState<InviteState>("checking");
  const [message, setMessage] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ tenantName: string; email: string; role: string; userAlreadyExists?: boolean } | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);

  // 1. Validate invite token on load
  useEffect(() => {
    if (!token) {
      setState("invalid");
      setMessage("Token de invitación inválido.");
      return;
    }

    fetch(`${getAdminApiBase()}/invites/${token}`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Invitación inválida");
        setInviteInfo(payload);

        // Auto-select auth mode based on whether user already has an account
        if (payload.userAlreadyExists) {
          setAuthMode("login");
        }

        // Check if there's already an active session (e.g. returning from Google OAuth)
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          // Has a session → let the server validate email ownership
          await doAcceptInvite(data.session.access_token, token);
        } else {
          setState("auth");
        }
      })
      .catch((err: Error) => {
        setState("invalid");
        setMessage(err.message);
      });
  }, [token]);

  // 1b. Listen for OAuth redirects (Google sign-in completes async)
  useEffect(() => {
    if (!token) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.access_token) {
        // Only auto-accept if we're still in the auth/checking state
        setState(prev => {
          if (prev === "auth" || prev === "checking") {
            // trigger accept asynchronously
            doAcceptInvite(session.access_token, token);
          }
          return prev;
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [token]);

  // 2. Accept invite (after auth)
  async function doAcceptInvite(accessToken: string, inviteToken: string) {
    setState("accepting");
    const res = await fetch(`${getAdminApiBase()}/invites/${inviteToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await res.json();
    if (!res.ok) {
      if (res.status === 403 && payload.error?.includes('otro email')) {
        await supabase.auth.signOut();
        setState("auth");
        setAuthError("Tu sesión actual no coincide con el email de la invitación. Hemos cerrado tu sesión anterior. Por favor, inicia sesión con la cuenta correcta.");
        return;
      }
      setState("invalid");
      setMessage(payload.error ?? "No se pudo aceptar la invitación");
      return;
    }
    if (payload.tenant_id) {
      window.localStorage.setItem("aicobranzas-active-workspace", payload.tenant_id);
    }
    setState("accepted");
    setTimeout(() => navigate("/cobranzas", { replace: true }), 1500);
  }

  // 3. Handle signup (new user sets password)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteInfo) return;
    setAuthError(null);

    if (password.length < 8) {
      setAuthError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Las contraseñas no coinciden.");
      return;
    }

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: inviteInfo.email,
        password,
      });
      if (error) {
        // If already registered, switch to login mode
        if (error.message.toLowerCase().includes("already registered") ||
            error.message.toLowerCase().includes("already in use")) {
          setAuthMode("login");
          setAuthError("Este email ya tiene una cuenta. Ingresa tu contraseña.");
        } else {
          setAuthError(error.message);
        }
        return;
      }
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setAuthError("Registro exitoso. Revisa tu email para confirmar tu cuenta, luego vuelve a este enlace.");
        return;
      }
      await doAcceptInvite(accessToken, token);
    } finally {
      setAuthLoading(false);
    }
  };

  // 4. Handle login (existing user)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteInfo) return;
    setAuthError(null);

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: inviteInfo.email,
        password,
      });
      if (error) {
        setAuthError(
          error.message.includes("Invalid login credentials")
            ? "Contraseña incorrecta."
            : error.message
        );
        return;
      }
      await doAcceptInvite(data.session.access_token, token);
    } finally {
      setAuthLoading(false);
    }
  };

  // 5. Continue with Google
  const continueWithGoogle = async () => {
    if (!token) return;
    setStartingGoogle(true);
    const redirectTo = `${window.location.origin}/invite?token=${token}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setStartingGoogle(false);
      setAuthError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex size-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center mb-3 shadow-lg">
            <ShieldCheck className="size-7 text-white" />
          </div>
          <p className="text-sm text-slate-500 font-medium tracking-wide uppercase">AiCobranzas</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

          {/* Checking */}
          {state === "checking" && (
            <div className="p-10 text-center space-y-3">
              <Loader2 className="size-10 mx-auto animate-spin text-blue-600" />
              <p className="text-slate-600 font-medium">Validando invitación...</p>
            </div>
          )}

          {/* Invalid */}
          {state === "invalid" && (
            <div className="p-10 text-center space-y-4">
              <XCircle className="size-12 mx-auto text-red-500" />
              <h1 className="text-xl font-bold text-slate-900">Invitación inválida</h1>
              <p className="text-sm text-slate-500">{message}</p>
              <Button className="w-full" onClick={() => navigate("/login")}>Ir al login</Button>
            </div>
          )}

          {/* Auth: set password or login */}
          {state === "auth" && inviteInfo && (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
                <h1 className="text-lg font-bold mb-1">Te invitaron a un workspace</h1>
                <div className="flex items-center gap-2 text-blue-100 text-sm">
                  <Building2 className="size-4 shrink-0" />
                  <span>{inviteInfo.tenantName}</span>
                  <span className="text-blue-300">·</span>
                  <span className="capitalize">{inviteInfo.role}</span>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Email (read-only) */}
                <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 border border-slate-200">
                  Invitación para: <span className="font-semibold text-slate-800">{inviteInfo.email}</span>
                </div>

                {/* Mode tabs */}
                <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50 gap-1">
                  <button
                    type="button"
                    onClick={() => { setAuthMode("signup"); setAuthError(null); setPassword(""); setConfirmPassword(""); }}
                    className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${authMode === "signup" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Nueva cuenta
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode("login"); setAuthError(null); setPassword(""); setConfirmPassword(""); }}
                    className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${authMode === "login" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Ya tengo cuenta
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={authMode === "signup" ? handleSignup : handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">
                      {authMode === "signup" ? "Crea tu contraseña" : "Tu contraseña"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={authMode === "signup" ? "Mínimo 8 caracteres" : "••••••••"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {authMode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Repite la contraseña"
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setAuthError(null); }}
                        required
                      />
                    </div>
                  )}

                  {authError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{authError}</p>
                  )}

                  <Button type="submit" className="w-full h-11" disabled={authLoading}>
                    {authLoading
                      ? <><Loader2 className="size-4 mr-2 animate-spin" />Procesando...</>
                      : authMode === "signup"
                        ? "Crear cuenta y aceptar invitación"
                        : <><LogIn className="size-4 mr-2" />Ingresar y aceptar invitación</>
                    }
                  </Button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">o</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Google */}
                <Button variant="outline" className="w-full h-11" disabled={startingGoogle} onClick={continueWithGoogle}>
                  {startingGoogle
                    ? <><Loader2 className="size-4 mr-2 animate-spin" />Redirigiendo...</>
                    : <>
                        <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        Continuar con Google
                      </>
                  }
                </Button>
              </div>
            </>
          )}

          {/* Accepting */}
          {state === "accepting" && (
            <div className="p-10 text-center space-y-3">
              <Loader2 className="size-10 mx-auto animate-spin text-blue-600" />
              <p className="text-slate-600 font-medium">Aceptando invitación...</p>
            </div>
          )}

          {/* Accepted */}
          {state === "accepted" && (
            <div className="p-10 text-center space-y-3">
              <CheckCircle2 className="size-12 mx-auto text-green-500" />
              <h1 className="text-xl font-bold text-slate-900">¡Bienvenido!</h1>
              <p className="text-sm text-slate-500">Invitación aceptada. Redirigiendo al dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
