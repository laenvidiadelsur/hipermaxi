import { useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, Users, CreditCard, Search, MoreVertical, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { useTenants, useCreateTenant, useUpdateTenant, useDeleteTenant } from "../../hooks/useAdmin";

export default function AdminTenants() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formNit, setFormNit] = useState("");
  const [formAddress, setFormAddress] = useState("");

  const { data: tenants = [], isLoading } = useTenants();
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();

  const filtered = tenants.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.nit?.includes(search)
  );

  const openCreate = () => { setFormName(""); setFormNit(""); setFormAddress(""); setShowCreate(true); };
  const openEdit = (t: any) => { setEditTenant(t); setFormName(t.name); setFormNit(t.nit ?? ""); setFormAddress(t.address ?? ""); };

  const handleCreate = () => {
    if (!formName) return;
    createTenant.mutate({ name: formName, nit: formNit, address: formAddress }, {
      onSuccess: () => setShowCreate(false),
    });
  };

  const handleUpdate = () => {
    if (!editTenant || !formName) return;
    updateTenant.mutate({ id: editTenant.id, name: formName, nit: formNit, address: formAddress }, {
      onSuccess: () => setEditTenant(null),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteTenant.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-BO");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Tenants</h1>
          <p className="text-slate-600 mt-1">Gestión de organizaciones en el sistema</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />Nuevo Tenant
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Tenants", value: tenants.length, icon: Building2, color: "blue" },
          { label: "Total Usuarios", value: tenants.reduce((s: number, t: any) => s + (t.users?.[0]?.count ?? 0), 0), icon: Users, color: "green" },
          { label: "Suscripciones Activas", value: tenants.filter((t: any) => t.subscriptions?.some((s: any) => s.enable)).length, icon: CreditCard, color: "purple" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`bg-${stat.color}-50 p-3 rounded-xl`}>
                <stat.icon className={`size-6 text-${stat.color}-600`} />
              </div>
              <div>
                <p className="text-sm text-slate-600">{stat.label}</p>
                {isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Tenants</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input placeholder="Buscar por nombre o NIT..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  {["Organización", "NIT", "Dirección", "Usuarios", "Suscripción", "Creado", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t: any) => {
                  const activeSub = t.subscriptions?.find((s: any) => s.enable);
                  return (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Building2 className="size-5 text-blue-600" />
                          </div>
                          <span className="font-medium text-slate-900">{t.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-sm">{t.nit ?? "—"}</td>
                      <td className="py-3 px-4 text-slate-600 text-sm max-w-[200px] truncate">{t.address ?? "—"}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-slate-50">
                          <Users className="size-3 mr-1" />{t.users?.[0]?.count ?? 0}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {activeSub ? (
                          <Badge className="bg-green-100 text-green-800 border-0">
                            {activeSub.subscription_plans?.name ?? "Activo"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">Sin plan</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-sm">{formatDate(t.created_at)}</td>
                      <td className="py-3 px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreVertical className="size-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="size-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(t.id)}>
                              <Trash2 className="size-4 mr-2" />Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-slate-500">No se encontraron tenants</div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent><DialogHeader><DialogTitle>Nuevo Tenant</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nombre *</Label><Input placeholder="Mi Empresa S.R.L." value={formName} onChange={e => setFormName(e.target.value)} /></div>
            <div className="space-y-2"><Label>NIT</Label><Input placeholder="123456789" value={formNit} onChange={e => setFormNit(e.target.value)} /></div>
            <div className="space-y-2"><Label>Dirección</Label><Input placeholder="Av. Principal 123, La Paz" value={formAddress} onChange={e => setFormAddress(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!formName || createTenant.isPending}>
              {createTenant.isPending ? "Creando..." : "Crear Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTenant} onOpenChange={v => !v && setEditTenant(null)}>
        <DialogContent><DialogHeader><DialogTitle>Editar Tenant</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nombre *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} /></div>
            <div className="space-y-2"><Label>NIT</Label><Input value={formNit} onChange={e => setFormNit(e.target.value)} /></div>
            <div className="space-y-2"><Label>Dirección</Label><Input value={formAddress} onChange={e => setFormAddress(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={!formName || updateTenant.isPending}>
              {updateTenant.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-red-500" />Eliminar Tenant</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminarán todos los datos asociados a este tenant.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
