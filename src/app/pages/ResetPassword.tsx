import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, DollarSign } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";

type PasswordStrength = "weak" | "medium" | "strong" | "very-strong";

function getStrength(pwd: string): PasswordStrength {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return "weak";
  if (score === 2) return "medium";
  if (score === 3) return "strong";
  return "very-strong";
}

const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; bars: number }> = {
  weak:        { label: "Muy débil",  color: "bg-red-500",    bars: 1 },
  medium:      { label: "Regular",    color: "bg-orange-400", bars: 2 },
  strong:      { label: "Fuerte",     color: "bg-blue-500",   bars: 3 },
  "very-strong":{ label: "Muy fuerte", color: "bg-green-500",  bars: 4 },
};

const REQUIREMENTS = [
  { label: "Mínimo 8 caracteres",       test: (p: string) => p.length >= 8 },
  { label: "Al menos una mayúscula",     test: (p: string) => /[A-Z]/.test(p) },
  { label: "Al menos un número",         test: (p: string) => /[0-9]/.test(p) },
  { label: "Al menos un símbolo (!@#$)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase sends the user to this page with a session token in the URL hash
  useEffect(() => {
    // If no session from reset link, redirect to login
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/login", { replace: true });
    });
  }, []);

  const strength = newPassword ? getStrength(newPassword) : null;
  const strengthCfg = strength ? STRENGTH_CONFIG[strength] : null;
  const allRequirementsMet = REQUIREMENTS.every(r => r.test(newPassword));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allRequirementsMet) { setError("La contraseña no cumple los requisitos mínimos"); return; }
    if (newPassword !== confirmPassword) { setError("Las contraseñas no coinciden"); return; }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setDone(true);
      toast.success("Contraseña actualizada correctamente");
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err: any) {
      setError(err.message ?? "Error al actualizar la contraseña");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
            <DollarSign className="size-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-slate-900">Ribentek</h1>
            <p className="text-sm text-slate-500">AI Cobranzas</p>
          </div>
        </div>

        <Card className="border-0 shadow-xl shadow-slate-200/60">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-900">Nueva contraseña</CardTitle>
            <CardDescription>Crea una contraseña segura para tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="size-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <CheckCircle2 className="size-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">¡Contraseña actualizada!</h3>
                <p className="text-sm text-slate-600">Redirigiendo al inicio de sesión...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                    <XCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* New password */}
                <div className="space-y-2">
                  <Label htmlFor="new-pwd">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="new-pwd"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>

                  {/* Strength meter */}
                  {newPassword && strengthCfg && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < strengthCfg.bars ? strengthCfg.color : "bg-slate-200"}`} />
                        ))}
                      </div>
                      <p className={`text-xs font-medium ${strengthCfg.color.replace("bg-", "text-")}`}>
                        {strengthCfg.label}
                      </p>
                    </div>
                  )}

                  {/* Requirements */}
                  {newPassword && (
                    <ul className="space-y-1 mt-2">
                      {REQUIREMENTS.map(r => {
                        const ok = r.test(newPassword);
                        return (
                          <li key={r.label} className={`flex items-center gap-2 text-xs ${ok ? "text-green-600" : "text-slate-500"}`}>
                            <CheckCircle2 className={`size-3.5 ${ok ? "text-green-500" : "text-slate-300"}`} />
                            {r.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Confirm */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-pwd">Confirmar contraseña</Label>
                  <div className="relative">
                    <Input
                      id="confirm-pwd"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`pr-10 ${confirmPassword && confirmPassword !== newPassword ? "border-red-300" : confirmPassword && confirmPassword === newPassword ? "border-green-400" : ""}`}
                      autoComplete="new-password"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-xs text-red-600">Las contraseñas no coinciden</p>
                  )}
                  {confirmPassword && confirmPassword === newPassword && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />Las contraseñas coinciden
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11" disabled={isLoading || !allRequirementsMet}>
                  {isLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Guardando...</> : "Cambiar contraseña"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
