import { useEffect, useState } from "react";
import { UserPlus, Search, Trash2, Shield, Building2, MoreVertical, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useAllUsers, useCreateAdminUser, useDeleteAdminUser, useTenants } from "../../hooks/useAdmin";
import { WorkspaceInvitesSection } from "../../components/admin/WorkspaceInvitesSection";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../data/supabase.types";
import { USER_ROLE_LABELS } from "../../data/supabase.types";

const ROLE_COLORS: Record<UserRole, string> = {
  Superadmin: "bg-red-100 text-red-800",
  Admin:      "bg-purple-100 text-purple-800",
  Agente:     "bg-blue-100 text-blue-800",
};

export default function AdminAccesos() {
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("Agente");
  const [formTenant, setFormTenant] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const { activeWorkspaceId } = useAuth();
  const [inviteTenantId, setInviteTenantId] = useState("");

  const { data: users = [], isLoading } = useAllUsers();
  const { data: tenants = [] } = useTenants();

  useEffect(() => {
    if (inviteTenantId || !(tenants as { id: string }[])?.length) return;
    const list = tenants as { id: string }[];
    const preferred =
      activeWorkspaceId && list.some((t) => t.id === activeWorkspaceId)
        ? activeWorkspaceId
        : list[0].id;
    setInviteTenantId(preferred);
  }, [tenants, activeWorkspaceId, inviteTenantId]);
  const createUser = useCreateAdminUser();
  const deleteUser = useDeleteAdminUser();

  const filtered = (users as any[]).filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchTenant = tenantFilter === "all" || u.tenant_id === tenantFilter;
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchTenant && matchRole;
  });

  const handleCreate = () => {
    if (!formEmail || !formPassword || !formName || !formRole || !formTenant) return;
    createUser.mutate(
      { email: formEmail, password: formPassword, name: formName, role: formRole, tenant_id: formTenant },
      { onSuccess: () => { setShowCreate(false); setFormEmail(""); setFormPassword(""); setFormName(""); } }
    );
  };

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-BO") : "—";
  const getTenantName = (id: string | null) => (tenants as any[]).find(t => t.id === id)?.name ?? "—";
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Accesos</h1>
          <p className="text-slate-600 mt-1">Gestión de usuarios y permisos en todos los tenants</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus className="size-4 mr-2" />Nuevo Acceso
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Usuarios", value: users.length },
          { label: "Superadmin", value: (users as any[]).filter(u => u.role === "Superadmin").length },
          { label: "Admin", value: (users as any[]).filter(u => u.role === "Admin").length },
          { label: "Agentes", value: (users as any[]).filter(u => u.role === "Agente").length },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-sm text-slate-600">{s.label}</p>
              {isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : <p className="text-2xl font-semibold">{s.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <WorkspaceInvitesSection
        variant="superadmin"
        tenants={(tenants as { id: string; name: string }[]).map((t) => ({
          id: t.id,
          name: t.name,
        }))}
        selectedTenantId={inviteTenantId}
        onTenantChange={setInviteTenantId}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-5">
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Tenant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tenants</SelectItem>
                {(tenants as any[]).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                <SelectItem value="Superadmin">Superadmin</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Agente">Agente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Lista de Usuarios ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  {["Usuario", "Email", "Rol", "Tenant", "Estado", "Último acceso", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: any) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-semibold text-blue-700">
                            {u.name?.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-slate-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-sm">{u.email}</td>
                    <td className="py-3 px-4">
                      <Badge className={`${ROLE_COLORS[u.role as UserRole]} border-0`}>
                        <Shield className="size-3 mr-1" />{USER_ROLE_LABELS[u.role as UserRole]}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Building2 className="size-4 text-slate-400" />
                        {u.tenants?.name ?? getTenantName(u.tenant_id)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={u.enabled ? "bg-green-100 text-green-800 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                        {u.enabled ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-sm">{formatDate(u.last_login)}</td>
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(u.id)}>
                            <Trash2 className="size-4 mr-2" />Eliminar acceso
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-slate-500">No se encontraron usuarios</div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo Acceso</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nombre completo *</Label><Input placeholder="Juan Pérez" value={formName} onChange={e => setFormName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="juan@empresa.com" value={formEmail} onChange={e => setFormEmail(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Contraseña *</Label>
              <div className="relative">
                <Input type={showPwd ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={formPassword} onChange={e => setFormPassword(e.target.value)} className="pr-20" />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-600">
                  {showPwd ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rol *</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Superadmin">Superadmin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Agente">Agente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tenant *</Label>
                <Select value={formTenant} onValueChange={setFormTenant}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {(tenants as any[]).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!formEmail || !formPassword || !formName || !formTenant || createUser.isPending}>
              {createUser.isPending ? "Creando..." : "Crear Acceso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-red-500" />Eliminar Acceso</AlertDialogTitle>
            <AlertDialogDescription>El usuario perderá acceso al sistema inmediatamente. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteUser.mutate(deleteId!); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
