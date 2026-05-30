import React, { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, DollarSign, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import ForgotPasswordModal from "../components/ForgotPasswordModal";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, dbUser, isLoading: authLoading, bootstrapError, hasWorkspaceAccess, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const next = searchParams.get("next");

  // If already logged in, redirect
  if (!authLoading && session && dbUser) {
    if (dbUser.role !== "Superadmin" && !hasWorkspaceAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <Card className="max-w-md w-full border-amber-200">
            <CardHeader>
              <CardTitle>Cuenta sin workspace asignado</CardTitle>
              <CardDescription>Tu sesión está activa, pero no tienes una membresía de workspace habilitada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Pide a un administrador que te invite a un workspace o reactive tu membresía.
              </p>
              <Button className="w-full" variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (!dbUser.enabled) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <Card className="max-w-md w-full border-slate-200">
            <CardHeader>
              <CardTitle>Acceso desactivado</CardTitle>
              <CardDescription>Tu usuario existe pero está deshabilitado en el sistema.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    const dest = dbUser.role === "Superadmin" ? "/admin/tenants" : (next && next.startsWith("/") ? next : "/cobranzas");
    navigate(dest, { replace: true });
    return null;
  }

  if (!authLoading && session && !dbUser) {
    if (bootstrapError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <Card className="max-w-md w-full border-red-200">
            <CardHeader>
              <CardTitle>No se pudo preparar tu cuenta</CardTitle>
              <CardDescription>{bootstrapError}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Si el frontend y el API van en el mismo dominio (por ejemplo Vercel), no hace falta configurar nada: vuelve a intentar o recarga. Si el API está en otro host, define{" "}
                <span className="font-mono text-xs">VITE_ADMIN_SERVER_URL</span> con esa URL y vuelve a desplegar.
              </p>
              <Button className="w-full" variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="size-6 animate-spin text-blue-600" />
          <p className="text-sm">Preparando tu cuenta…</p>
        </div>
      </div>
    );
  }

  const validate = () => {
    if (!email.trim()) return "El email es requerido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Ingresa un email válido";
    if (!password) return "La contraseña es requerida";
    if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setIsLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setError("Email o contraseña incorrectos");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Debes confirmar tu email antes de iniciar sesión");
        } else if (authError.message.includes("too many requests")) {
          setError("Demasiados intentos. Espera unos minutos antes de intentar de nuevo");
        } else {
          setError(authError.message);
        }
        return;
      }

      // AuthContext onAuthStateChange handles dbUser load + redirect
      toast.success("Bienvenido!");
    } catch {
      setError("Error inesperado. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setOauthLoading(true);
    const redirectTo = `${window.location.origin}${next || "/cobranzas"}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) {
      setError(oauthError.message || "No se pudo iniciar sesión con Google");
      setOauthLoading(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] size-80 rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] left-[-60px] size-64 rounded-full bg-white/5" />
        <div className="absolute top-1/3 left-[-40px] size-40 rounded-full bg-white/10" />

        <div className="relative z-10 text-center">
          <div className="size-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <DollarSign className="size-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Ribentek</h1>
          <p className="text-2xl font-medium text-blue-100 mb-6">AI Cobranzas</p>
          <p className="text-blue-200 text-lg max-w-xs leading-relaxed">
            Automatiza tus cobranzas con inteligencia artificial. Recordatorios inteligentes, seguimiento en tiempo real.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6 text-center">
            {[
              { value: "95%", label: "Tasa de entrega" },
              { value: "3x", label: "Más recuperación" },
              { value: "24/7", label: "Automatización" },
            ].map(s => (
              <div key={s.label}>
                <p className="text-3xl font-bold text-white">{s.value}</p>
                <p className="text-blue-200 text-sm mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="size-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
              <DollarSign className="size-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-900">Ribentek</h1>
              <p className="text-sm text-slate-500">AI Cobranzas</p>
            </div>
          </div>

          <Card className="border-0 shadow-xl shadow-slate-200/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl text-slate-900">Iniciar sesión</CardTitle>
              <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Error alert */}
                {error && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                    <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    autoComplete="email"
                    disabled={isLoading}
                    className={error ? "border-red-300 focus-visible:ring-red-300" : ""}
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      autoComplete="current-password"
                      disabled={isLoading}
                      className={`pr-10 ${error ? "border-red-300 focus-visible:ring-red-300" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11 text-base"
                  disabled={isLoading || oauthLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="size-4 mr-2 animate-spin" />Iniciando sesión...</>
                  ) : (
                    "Iniciar sesión"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-base"
                  disabled={isLoading || oauthLoading}
                  onClick={handleGoogleSignIn}
                >
                  {oauthLoading ? (
                    <><Loader2 className="size-4 mr-2 animate-spin" />Conectando con Google...</>
                  ) : (
                    "Continuar con Google"
                  )}
                </Button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-6">
                ¿Sin acceso? Contacta al administrador del sistema.
              </p>
              <p className="text-center mt-2">
                <a href="/setup" className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
                  Primera vez aquí → Configurar el sistema
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Forgot password modal */}
      <ForgotPasswordModal open={showForgot} onOpenChange={setShowForgot} />
    </div>
  );
}
