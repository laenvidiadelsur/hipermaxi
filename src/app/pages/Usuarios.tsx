import { useState } from "react";
import { Search, Plus, Edit, UserCheck, UserX } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { WorkspaceInvitesSection } from "../components/admin/WorkspaceInvitesSection";
import { useAuth } from "../context/AuthContext";
import { useUsers, useToggleUser, useUpdateUser } from "../hooks/useUsers";
import type { DbUser, UserRole } from "../data/supabase.types";
import { USER_ROLE_LABELS } from "../data/supabase.types";

export default function Usuarios() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);

  // Form state
  const [formNombre, setFormNombre] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRol, setFormRol] = useState<UserRole>("Agente");

  const { activeRole, tenantId } = useAuth();
  const canIssueInvites =
    !!tenantId && (activeRole === "Admin" || activeRole === "Superadmin");

  const { data: users = [], isLoading } = useUsers();
  const toggleUser = useToggleUser();
  const updateUser = useUpdateUser();

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRolBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      Superadmin: "bg-red-100 text-red-800",
      Admin: "bg-purple-100 text-purple-800",
      Agente: "bg-blue-100 text-blue-800",
    };
    return <Badge className={colors[role]}>{USER_ROLE_LABELS[role]}</Badge>;
  };

  const getEstadoBadge = (enabled: boolean) =>
    enabled ? (
      <Badge className="bg-green-100 text-green-800">Activo</Badge>
    ) : (
      <Badge className="bg-slate-100 text-slate-800">Inactivo</Badge>
    );

  const handleToggle = (user: DbUser) => {
    toggleUser.mutate(
      { id: user.id, currentEnabled: user.enabled },
      {
        onSuccess: () =>
          toast.success(`Usuario ${user.enabled ? "desactivado" : "activado"} correctamente`),
        onError: () => toast.error("Error al cambiar estado del usuario"),
      }
    );
  };

  const handleEdit = () => {
    if (!selectedUser) return;
    updateUser.mutate(
      { id: selectedUser.id, payload: { name: formNombre, email: formEmail, role: formRol } },
      {
        onSuccess: () => {
          toast.success("Usuario actualizado");
          setIsEditDialogOpen(false);
        },
        onError: () => toast.error("Error al guardar cambios"),
      }
    );
  };

  const openEdit = (user: DbUser) => {
    setSelectedUser(user);
    setFormNombre(user.name);
    setFormEmail(user.email);
    setFormRol(user.role);
    setIsEditDialogOpen(true);
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Usuarios</h1>
          <p className="text-slate-600 mt-2">Gestión de usuarios del sistema</p>
        </div>

        {/* Create (placeholder — requires admin API key) */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre Completo</Label>
                <Input id="nombre" placeholder="Juan Pérez" value={formNombre} onChange={e => setFormNombre(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="juan@empresa.com" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rol">Rol</Label>
                <Select value={formRol} onValueChange={(v: UserRole) => setFormRol(v)}>
                  <SelectTrigger id="rol"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Superadmin">Superadmin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Agente">Agente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => toast.info("Creación de usuarios requiere configuración del servidor de auth")}>
                Crear Usuario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Usuarios", value: users.length },
          { label: "Usuarios Activos", value: users.filter(u => u.enabled).length },
          { label: "Admin", value: users.filter(u => u.role === "Admin").length },
          { label: "Agentes", value: users.filter(u => u.role === "Agente").length },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-sm text-slate-600">{stat.label}</p>
              {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-semibold mt-1">{stat.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {canIssueInvites ? <WorkspaceInvitesSection variant="tenant" /> : null}

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Buscar usuario por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Lista de Usuarios</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último Acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-slate-600">{user.email}</TableCell>
                    <TableCell>{getRolBadge(user.role)}</TableCell>
                    <TableCell>{getEstadoBadge(user.enabled)}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{formatDate(user.last_login)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                          <Edit className="size-4 mr-2" />Editar
                        </Button>
                        <Button
                          variant={user.enabled ? "ghost" : "default"}
                          size="sm"
                          onClick={() => handleToggle(user)}
                          disabled={toggleUser.isPending}
                        >
                          {user.enabled ? (
                            <><UserX className="size-4 mr-2" />Desactivar</>
                          ) : (
                            <><UserCheck className="size-4 mr-2" />Activar</>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-8 text-slate-500">No se encontraron usuarios</div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuario</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre Completo</Label>
              <Input id="edit-name" value={formNombre} onChange={e => setFormNombre(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rol">Rol</Label>
              <Select value={formRol} onValueChange={(v: UserRole) => setFormRol(v)}>
                <SelectTrigger id="edit-rol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Superadmin">Superadmin</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Agente">Agente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
