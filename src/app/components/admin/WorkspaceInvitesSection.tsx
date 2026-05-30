import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  useCreateInvite,
  useInvites,
  useResendInvite,
  useRevokeInvite,
} from "../../hooks/useAdmin";
import { useAuth } from "../../context/AuthContext";

type TenantOption = { id: string; name: string };

export type WorkspaceInvitesSectionProps =
  | { variant: "tenant" }
  | {
      variant: "superadmin";
      tenants: TenantOption[];
      selectedTenantId: string;
      onTenantChange: (tenantId: string) => void;
    };

export function WorkspaceInvitesSection(props: WorkspaceInvitesSectionProps) {
  const { tenantId: authTenantId } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Admin" | "Agente">("Agente");

  const scopeTenantId =
    props.variant === "superadmin" ? props.selectedTenantId : authTenantId ?? "";

  const { data: invites = [], isLoading: invitesLoading } = useInvites(
    "all",
    props.variant === "superadmin" ? { tenantId: props.selectedTenantId } : undefined,
  );

  const createInvite = useCreateInvite();
  const resendInvite = useResendInvite();
  const revokeInvite = useRevokeInvite();

  const pendingInvites = invites.filter((i) => i.status === "pending").length;
  const activeInvites = invites.filter(
    (i) => i.status !== "revoked" && i.status !== "accepted",
  ).length;

  const tenantPayload =
    props.variant === "superadmin" ? { tenantId: props.selectedTenantId } : {};

  const handleCreateInvite = () => {
    if (!inviteEmail.trim() || !scopeTenantId) return;
    createInvite.mutate(
      { email: inviteEmail.trim(), role: inviteRole, ...tenantPayload },
      { onSuccess: () => setInviteEmail("") },
    );
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-BO") : "\u2014";

  const superadminPicker =
    props.variant === "superadmin" ? (
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-slate-600">Workspace destino</span>
        <Select value={props.selectedTenantId} onValueChange={props.onTenantChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleccionar tenant" />
          </SelectTrigger>
          <SelectContent>
            {props.tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitaciones por correo</CardTitle>
        <p className="text-sm font-normal text-slate-600">
          {props.variant === "superadmin"
            ? "Elige el workspace y el rol (Admin o Agente) antes de enviar."
            : "Invita a tu workspace actual como administrador o agente."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`grid grid-cols-1 gap-3 lg:items-end ${
            props.variant === "superadmin"
              ? "lg:grid-cols-[minmax(180px,220px)_1fr_160px_auto]"
              : "lg:grid-cols-[1fr_160px_auto]"
          }`}
        >
          {superadminPicker}
          <Input
            type="email"
            placeholder="usuario@empresa.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Select
            value={inviteRole}
            onValueChange={(v) => setInviteRole(v as "Admin" | "Agente")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Agente">Agente</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleCreateInvite}
            disabled={
              createInvite.isPending ||
              !inviteEmail.trim() ||
              !scopeTenantId ||
              (props.variant === "superadmin" && !props.selectedTenantId)
            }
          >
            {createInvite.isPending ? "Enviando..." : "Enviar invitaci\u00f3n"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge className="bg-blue-100 text-blue-700 border-0">
            Pendientes: {pendingInvites}
          </Badge>
          <Badge className="bg-slate-100 text-slate-700 border-0">
            Activas: {activeInvites}
          </Badge>
          <span>
            La invitaci\u00f3n puede aceptarse con email o Google (mismo correo).
          </span>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-2 px-3 font-medium text-slate-600">Email</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">Rol</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">Estado</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">Expira</th>
                <th className="text-right py-2 px-3 font-medium text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(invitesLoading ? [] : invites).slice(0, 12).map((inv) => (
                <tr key={inv.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3">{inv.email}</td>
                  <td className="py-2 px-3">{inv.role}</td>
                  <td className="py-2 px-3">
                    <Badge className="bg-slate-100 text-slate-700 border-0">
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">{formatDate(inv.expires_at)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={inv.status !== "pending" || resendInvite.isPending}
                        onClick={() =>
                          resendInvite.mutate({
                            inviteId: inv.id,
                            ...tenantPayload,
                          })
                        }
                      >
                        Reenviar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        disabled={inv.status !== "pending" || revokeInvite.isPending}
                        onClick={() =>
                          revokeInvite.mutate({
                            inviteId: inv.id,
                            ...tenantPayload,
                          })
                        }
                      >
                        Revocar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!invitesLoading && invites.length === 0 ? (
            <div className="py-5 text-center text-sm text-slate-500">
              A\u00fan no hay invitaciones para este workspace.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}