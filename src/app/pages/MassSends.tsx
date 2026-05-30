import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { useAuth } from "../context/AuthContext";
import { whatsappService } from "../services/whatsapp.service";
import { useCreateMassSend, useMassSends, usePreviewMassSend, useRunMassSend } from "../hooks/useWhatsapp";

type Step = 1 | 2 | 3 | 4;

export default function MassSends() {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [language, setLanguage] = useState("es_LA");
  const [mode, setMode] = useState<"manual" | "scheduled">("manual");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [minDaysOverdue, setMinDaysOverdue] = useState<string>("");
  const [maxDaysOverdue, setMaxDaysOverdue] = useState<string>("");
  const [minAmountDue, setMinAmountDue] = useState<string>("");
  const [maxAmountDue, setMaxAmountDue] = useState<string>("");
  const [debtStatus, setDebtStatus] = useState<string>("");

  const { data: massSends = [], isLoading: loadingMassSends } = useMassSends();
  const { data: approvedTemplates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["approved-templates", tenantId],
    queryFn: () => whatsappService.getApprovedTemplates(tenantId!),
    enabled: !!tenantId,
  });
  const previewMutation = usePreviewMassSend();
  const createMutation = useCreateMassSend();
  const runMutation = useRunMassSend();

  const filters = useMemo(() => ({
    min_days_overdue: minDaysOverdue ? Number(minDaysOverdue) : null,
    max_days_overdue: maxDaysOverdue ? Number(maxDaysOverdue) : null,
    min_amount_due: minAmountDue ? Number(minAmountDue) : null,
    max_amount_due: maxAmountDue ? Number(maxAmountDue) : null,
    debt_status: debtStatus || null,
  }), [debtStatus, maxAmountDue, maxDaysOverdue, minAmountDue, minDaysOverdue]);

  const handlePreview = () => {
    previewMutation.mutate(filters, {
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const handleCreate = () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    if (!templateId) return toast.error("Selecciona una plantilla aprobada");
    createMutation.mutate({
      name: name.trim(),
      template_id: templateId,
      language,
      filters,
      mode,
      schedule: mode === "scheduled"
        ? { cron_expression: cronExpression, timezone: "America/Bogota", enabled: true }
        : null,
    }, {
      onSuccess: () => {
        toast.success("Envios masivos guardados");
        setStep(4);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const stepTitle = {
    1: "Paso 1: Plantilla",
    2: "Paso 2: Segmentacion cobranza",
    3: "Paso 3: Vista previa",
    4: "Paso 4: Confirmacion y ejecucion",
  }[step];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-900 tracking-tight">Envios Masivos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Orquesta envios parametrizados por condiciones de cobranza</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/mensajeria/dashboard")}>Ver impacto en dashboard</Button>
          <Button variant="outline" onClick={() => navigate("/bandeja")}>Ir a Bandeja</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">{stepTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={step === s ? "default" : "outline"}
                  onClick={() => setStep(s as Step)}
                >
                  {s}
                </Button>
              ))}
            </div>

            {step === 1 ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="mass-send-name" className="text-xs text-slate-600">Nombre del envio</label>
                  <Input id="mass-send-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mora 7 dias - Utility" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="mass-send-template" className="text-xs text-slate-600">Plantilla aprobada</label>
                  <select
                    id="mass-send-template"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    disabled={loadingTemplates}
                  >
                    <option value="">{loadingTemplates ? "Cargando..." : "Selecciona plantilla"}</option>
                    {approvedTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>{tpl.template_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="mass-send-lang" className="text-xs text-slate-600">Idioma</label>
                    <Input id="mass-send-lang" value={language} onChange={(e) => setLanguage(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="mass-send-mode" className="text-xs text-slate-600">Modo</label>
                    <select
                      id="mass-send-mode"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as "manual" | "scheduled")}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="manual">Manual</option>
                      <option value="scheduled">Programado</option>
                    </select>
                  </div>
                </div>
                {mode === "scheduled" ? (
                  <div className="space-y-1">
                    <label htmlFor="mass-send-cron" className="text-xs text-slate-600">Cron expresion</label>
                    <Input id="mass-send-cron" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} placeholder="0 9 * * *" />
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Min dias mora</label>
                  <Input value={minDaysOverdue} onChange={(e) => setMinDaysOverdue(e.target.value)} type="number" min={0} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Max dias mora</label>
                  <Input value={maxDaysOverdue} onChange={(e) => setMaxDaysOverdue(e.target.value)} type="number" min={0} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Min monto pendiente</label>
                  <Input value={minAmountDue} onChange={(e) => setMinAmountDue(e.target.value)} type="number" min={0} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Max monto pendiente</label>
                  <Input value={maxAmountDue} onChange={(e) => setMaxAmountDue(e.target.value)} type="number" min={0} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs text-slate-600">Estado deuda (opcional)</label>
                  <select
                    value={debtStatus}
                    onChange={(e) => setDebtStatus(e.target.value)}
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Todos</option>
                    <option value="Pending">Pending</option>
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3">
                <Button onClick={handlePreview} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? "Calculando..." : "Previsualizar destinatarios"}
                </Button>
                {previewMutation.data ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      Destinatarios estimados: <span className="font-semibold">{previewMutation.data.total_recipients}</span>
                    </p>
                    <div className="rounded-md border">
                      {previewMutation.data.sample.map((item) => (
                        <div key={item.contact_id} className="flex items-center justify-between px-3 py-2 border-b last:border-0">
                          <div>
                            <p className="text-sm font-medium">{item.contact_name}</p>
                            <p className="text-xs text-slate-500">{item.phone_number}</p>
                          </div>
                          <div className="text-xs text-right text-slate-500">
                            <p>Mora max: {item.max_days_overdue} dias</p>
                            <p>Pendiente: {item.total_pending}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Ejecuta la previsualizacion para ver el alcance.</p>
                )}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-3">
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Guardando..." : "Guardar envio"}
                </Button>
                <p className="text-xs text-slate-500">
                  Guarda primero el envio. Luego ejecutalo desde el historial en modo manual.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Resumen rapido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total envios</span>
              <span className="font-medium">{massSends.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Activos</span>
              <span className="font-medium">{massSends.filter((item) => item.status === "active").length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Programados</span>
              <span className="font-medium">{massSends.filter((item) => item.mode === "scheduled").length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Historial de envios</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMassSends ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : massSends.length === 0 ? (
            <p className="text-sm text-slate-500">Todavia no hay envios masivos parametrizados.</p>
          ) : (
            <div className="space-y-2">
              {massSends.map((item) => (
                <div key={item.id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.template_name} - {item.mode === "scheduled" ? "Programado" : "Manual"}
                    </p>
                    {item.last_run ? (
                      <p className="text-xs text-slate-500">
                        Ultima ejecucion: sent={item.last_run.sent_count}, failed={item.last_run.failed_count}, skipped={item.last_run.skipped_count}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{item.status}</Badge>
                    <Button
                      size="sm"
                      onClick={() => runMutation.mutate(item.id, {
                        onSuccess: () => toast.success("Ejecucion completada"),
                        onError: (err) => toast.error((err as Error).message),
                      })}
                      disabled={runMutation.isPending}
                    >
                      Ejecutar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
