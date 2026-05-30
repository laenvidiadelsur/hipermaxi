import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  DollarSign, Building2, User, Mail, Eye, EyeOff, CheckCircle2,
  Loader2, AlertCircle, ShieldCheck, ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { getAdminApiBase } from "../services/admin.service";

type Step = "checking" | "welcome" | "form" | "done" | "already-setup";

const REQUIREMENTS = [
  { label: "Mínimo 8 caracteres",        test: (p: string) => p.length >= 8 },
  { label: "Al menos una mayúscula",      test: (p: string) => /[A-Z]/.test(p) },
  { label: "Al menos un número",          test: (p: string) => /[0-9]/.test(p) },
];

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("checking");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tenantName, setTenantName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const allMet = REQUIREMENTS.every(r => r.test(password));

  // Check if setup needed
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${getAdminApiBase()}/setup/check`);
        if (!res.ok) throw new Error("Server unavailable");
        const { needsSetup } = await res.json();
        setStep(needsSetup ? "welcome" : "already-setup");
      } catch {
        // If server unreachable, still show form — server will guard the 409
        setStep("welcome");
      }
    };
    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenantName.trim() || !adminName.trim() || !email.trim() || !password) {
      setError("Completa todos los campos");
      return;
    }
    if (!allMet) {
      setError("La contraseña no cumple los requisitos");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Ingresa un email válido");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getAdminApiBase()}/setup/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantName, adminName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setStep("already-setup");
          return;
        }
        throw new Error(data.error || "Error desconocido");
      }

      // Auto login after setup
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        toast.success("¡Cuenta creada! Inicia sesión.");
        navigate("/login", { replace: true });
        return;
      }

      setStep("done");
      setTimeout(() => navigate("/admin/tenants", { replace: true }), 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Checking state ─────────────────────────────────────────
  if (step === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center animate-pulse">
            <DollarSign className="size-7 text-white" />
          </div>
          <p className="text-slate-500 text-sm animate-pulse">Verificando configuración...</p>
        </div>
      </div>
    );
  }

  // ── Already setup ──────────────────────────────────────────
  if (step === "already-setup") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-8">
        <div className="text-center max-w-sm">
          <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="size-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Sistema ya configurado</h2>
          <p className="text-slate-600 mb-6">El sistema ya tiene una cuenta de administrador. Por favor inicia sesión.</p>
          <Button className="w-full" onClick={() => navigate("/login")}>
            Ir al inicio de sesión <ArrowRight className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Done ───────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="size-20 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="size-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">¡Configuración completa!</h2>
          <p className="text-slate-600 mb-2">Tu cuenta Superadmin ha sido creada.</p>
          <p className="text-slate-400 text-sm animate-pulse">Redirigiendo al panel...</p>
        </div>
      </div>
    );
  }

  // ── Welcome / Form ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-200">
            <DollarSign className="size-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Bienvenido a Ribentek AI Cobranzas</h1>
          <p className="text-slate-600 text-lg">Configura tu cuenta de administrador para comenzar</p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[
            { num: 1, label: "Organización" },
            { num: 2, label: "Cuenta admin" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && <div className="w-12 h-px bg-blue-200" />}
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{s.num}</span>
                </div>
                <span className="text-sm font-medium text-blue-700">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Section 1 — Organización */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 className="size-4 text-blue-600" />
                </div>
                <h2 className="font-semibold text-slate-900">Información de la organización</h2>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenantName">Nombre de la empresa / organización *</Label>
                <Input
                  id="tenantName"
                  placeholder="Mi Empresa S.R.L."
                  value={tenantName}
                  onChange={e => setTenantName(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-slate-500">Este será el nombre de tu tenant principal en el sistema</p>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Section 2 — Admin account */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <ShieldCheck className="size-4 text-purple-600" />
                </div>
                <h2 className="font-semibold text-slate-900">Cuenta de Superadministrador</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Nombre completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      id="adminName"
                      placeholder="Juan Pérez"
                      value={adminName}
                      onChange={e => setAdminName(e.target.value)}
                      className="pl-10 h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@empresa.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-10 h-11"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label htmlFor="password">Contraseña *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pr-12 h-11"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                {/* Requirements */}
                {password && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1 mt-2">
                    {REQUIREMENTS.map(r => {
                      const ok = r.test(password);
                      return (
                        <div key={r.label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-slate-400"}`}>
                          <CheckCircle2 className={`size-3.5 ${ok ? "text-green-500" : "text-slate-300"}`} />
                          {r.label}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">¿Qué pasará al completar?</span><br />
                Se creará tu organización y una cuenta Superadmin con la que podrás gestionar todos los aspectos del sistema: tenants, usuarios y suscripciones.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Loader2 className="size-5 mr-2 animate-spin" />Configurando sistema...</>
              ) : (
                <>Completar configuración <ArrowRight className="size-5 ml-2" /></>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Esta página solo está disponible durante la configuración inicial del sistema
        </p>
      </div>
    </div>
  );
}
