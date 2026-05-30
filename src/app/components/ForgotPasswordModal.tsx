import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "../../lib/supabase";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ForgotPasswordModal({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Ingresa un email válido");
      return;
    }
    setIsLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? "Error al enviar el email. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => { setSent(false); setEmail(""); setError(null); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recuperar contraseña</DialogTitle>
          <DialogDescription>
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="size-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="size-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">¡Email enviado!</h3>
            <p className="text-sm text-slate-600">
              Revisa tu bandeja de entrada en <strong>{email}</strong>.<br />
              El enlace expira en 1 hora.
            </p>
            <p className="text-xs text-slate-400 mt-3">
              ¿No ves el email? Revisa tu carpeta de spam.
            </p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email de tu cuenta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Enviando...</> : "Enviar enlace"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {sent && (
          <DialogFooter>
            <Button onClick={handleClose} className="w-full">Cerrar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
