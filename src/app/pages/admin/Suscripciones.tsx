import { useState } from "react";
import { CreditCard, Plus, ToggleLeft, ToggleRight, AlertCircle, Calendar, Building2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useAdminSubscriptions, useAdminPlans, useCreateSubscription, useToggleSubscription, useTenants } from "../../hooks/useAdmin";

export default function AdminSuscripciones() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formTenant, setFormTenant] = useState("");
  const [formPlan, setFormPlan] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formExpiry, setFormExpiry] = useState("");

  const { data: subscriptions = [], isLoading } = useAdminSubscriptions();
  const { data: plans = [] } = useAdminPlans();
  const { data: tenants = [] } = useTenants();
  const createSub = useCreateSubscription();
  const toggleSub = useToggleSubscription();

  const filtered = (subscriptions as any[]).filter(s => {
    const q = search.toLowerCase();
    return s.tenants?.name?.toLowerCase().includes(q) || s.subscription_plans?.name?.toLowerCase().includes(q);
  });

  const active = (subscriptions as any[]).filter(s => s.enable && new Date(s.expiration_date) > new Date());
  const expiringSoon = active.filter(s => {
    const days = (new Date(s.expiration_date).getTime() - Date.now()) / 86400000;
    return days <= 7;
  });
  const expired = (subscriptions as any[]).filter(s => new Date(s.expiration_date) < new Date());

  const handleCreate = () => {
    if (!formTenant || !formPlan || !formPrice || !formExpiry) return;
    createSub.mutate(
      { tenant_id: formTenant, subscription_plan_id: formPlan, price: parseFloat(formPrice), expiration_date: formExpiry },
      { onSuccess: () => { setShowCreate(false); setFormTenant(""); setFormPlan(""); setFormPrice(""); setFormExpiry(""); } }
    );
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-BO");
  const daysUntil = (iso: string) => {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    return days;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Suscripciones</h1>
          <p className="text-slate-600 mt-1">Gestión de planes y accesos por tenant</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />Nueva Suscripción
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: subscriptions.length, color: "blue", Icon: CreditCard },
          { label: "Activas", value: active.length, color: "green", Icon: ToggleRight },
          { label: "Por vencer (7d)", value: expiringSoon.length, color: "orange", Icon: AlertCircle },
          { label: "Vencidas", value: expired.length, color: "red", Icon: Calendar },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`bg-${s.color}-50 p-3 rounded-xl`}>
                <s.Icon className={`size-6 text-${s.color}-600`} />
              </div>
              <div>
                <p className="text-sm text-slate-600">{s.label}</p>
                {isLoading ? <Skeleton className="h-7 w-8 mt-1" /> : <p className="text-2xl font-semibold">{s.value}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <Input placeholder="Buscar tenant o plan..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Lista de Suscripciones</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  {["Tenant", "Plan", "Precio", "Vencimiento", "Días restantes", "Estado", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => {
                  const days = daysUntil(s.expiration_date);
                  const isExpired = days < 0;
                  const isWarn = days >= 0 && days <= 7;
                  return (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-slate-400" />
                          <span className="font-medium text-slate-900">{s.tenants?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{s.subscription_plans?.name ?? "—"}</td>
                      <td className="py-3 px-4 text-slate-900 font-medium">Bs. {Number(s.price).toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-600 text-sm">{formatDate(s.expiration_date)}</td>
                      <td className="py-3 px-4">
                        <span className={`text-sm font-medium ${isExpired ? "text-red-600" : isWarn ? "text-orange-500" : "text-green-600"}`}>
                          {isExpired ? `Venció hace ${Math.abs(days)}d` : `${days} días`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`border-0 ${s.enable && !isExpired ? "bg-green-100 text-green-800" : isExpired ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>
                          {s.enable && !isExpired ? "Activa" : isExpired ? "Vencida" : "Inactiva"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSub.mutate(s.id)}
                          disabled={toggleSub.isPending}
                          className="text-slate-600"
                        >
                          {s.enable ? <ToggleRight className="size-5 text-green-600" /> : <ToggleLeft className="size-5 text-slate-400" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!isLoading && filtered.length === 0 && <div className="text-center py-10 text-slate-500">No se encontraron suscripciones</div>}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva Suscripción</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tenant *</Label>
              <Select value={formTenant} onValueChange={setFormTenant}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tenant" /></SelectTrigger>
                <SelectContent>{(tenants as any[]).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan *</Label>
              <Select value={formPlan} onValueChange={setFormPlan}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                <SelectContent>
                  {(plans as any[]).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — Bs. {p.price}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Precio (Bs.) *</Label><Input type="number" placeholder="0.00" value={formPrice} onChange={e => setFormPrice(e.target.value)} /></div>
              <div className="space-y-2"><Label>Fecha de vencimiento *</Label><Input type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!formTenant || !formPlan || !formPrice || !formExpiry || createSub.isPending}>
              {createSub.isPending ? "Creando..." : "Crear Suscripción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
