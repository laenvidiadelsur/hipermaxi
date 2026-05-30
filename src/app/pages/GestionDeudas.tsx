import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Search, Filter, Download, ChevronDown, ChevronUp, Calendar, FileText, Phone,
  User, DollarSign, Users, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import { ContactSelectorModal } from "../components/ContactSelectorModal";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useDebtDetails, useDebtsSummary } from "../hooks/useDebts";
import { useCreateMassSend, useMassSends, usePreviewMassSend, useRunMassSend, useTemplates } from "../hooks/useWhatsapp";
import { useContacts } from "../hooks/useContacts";
import type { DebtStatus } from "../data/supabase.types";
import { DEBT_STATUS_LABELS } from "../data/supabase.types";
import { Checkbox } from "../components/ui/checkbox";
import { useAuth } from "../context/AuthContext";
import { adminDebtsService } from "../services/admin.service";

type VistaMode = "individual" | "agrupada";
type MassStep = 1 | 2 | 3 | 4 | 5;

/** Tipografía cercana a WhatsApp Web (Segoe UI / Helvetica / Arial). */
const WHATSAPP_PREVIEW_FONT_FAMILY =
  '"Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';

function interpolateTemplateText(text: string, params: string[]): string {
  if (!text) return "";
  if (!params.length) return text;
  return text.replace(/\{\{(\d+)\}\}/g, (_, indexRaw: string) => {
    const index = Number(indexRaw) - 1;
    return index >= 0 && index < params.length ? params[index] : `{{${indexRaw}}}`;
  });
}

function maxPlaceholderIndex(text: string): number {
  let max = 0;
  if (!text) return 0;
  const re = /\{\{(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

function getTemplateComponent<T extends Record<string, unknown>>(components: unknown, type: string): T | null {
  if (!Array.isArray(components)) return null;
  const found = components.find((c) => String((c as { type?: string })?.type || "").toUpperCase() === type.toUpperCase());
  return (found as T) || null;
}

const STATUS_OPTIONS: Array<{ value: DebtStatus | "all"; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "Pending", label: "Pendiente" },
  { value: "Active", label: "En Gestión" },
  { value: "Paid", label: "Pagada" },
  { value: "Expired", label: "Vencida" },
];

export function GestionDeudas() {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<DebtStatus | "all">("all");
  const [sortBy, setSortBy] = useState<string>("expiration_date_desc");
  const [vistaMode, setVistaMode] = useState<VistaMode>("individual");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [newDebtContactId, setNewDebtContactId] = useState<string>("");
  const [newDebtAmount, setNewDebtAmount] = useState<string>("");
  const [newDebtPenalty, setNewDebtPenalty] = useState<string>("");
  const [newDebtDesc, setNewDebtDesc] = useState<string>("");
  const [newDebtExp, setNewDebtExp] = useState<string>("");
  const [savingDebt, setSavingDebt] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ name?: string; phone_number?: string; email?: string; amount: number; penalty?: number; total?: number; description?: string; expiration_date: string }>>([]);
  const [importing, setImporting] = useState(false);

  // Wizard de envíos masivos
  const [showCobranzasModal, setShowCobranzasModal] = useState(false);
  const [currentStep, setCurrentStep] = useState<MassStep>(1);
  const [massSendName, setMassSendName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [language, setLanguage] = useState("es_LA");
  const [massSendMode, setMassSendMode] = useState<"manual" | "scheduled">("manual");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [minDaysOverdue, setMinDaysOverdue] = useState<string>("");
  const [maxDaysOverdue, setMaxDaysOverdue] = useState<string>("");
  const [minAmountDue, setMinAmountDue] = useState<string>("");
  const [maxAmountDue, setMaxAmountDue] = useState<string>("");
  const [debtStatusForSend, setDebtStatusForSend] = useState<string>("");
  const [showIncludeSelector, setShowIncludeSelector] = useState(false);
  const [showExcludeSelector, setShowExcludeSelector] = useState(false);
  const [includedContactIds, setIncludedContactIds] = useState<string[]>([]);
  const [excludedContactIds, setExcludedContactIds] = useState<string[]>([]);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [createdMassSendId, setCreatedMassSendId] = useState<string | null>(null);

  // ── Data from Supabase ───────────────────────────────────
  const { data: debtDetails = [], isLoading: detailsLoading } = useDebtDetails({
    status: statusFilter,
    search: searchTerm,
    sortBy: sortBy as any,
  });
  const { data: summary, isLoading: summaryLoading } = useDebtsSummary();
  const { data: templates = [] } = useTemplates();
  const { data: contacts = [] } = useContacts();
  useMassSends();
  const previewMutation = usePreviewMassSend();
  const createMutation = useCreateMassSend();
  const runMutation = useRunMassSend();

  // ── Grouped view ─────────────────────────────────────────
  const clientesAgrupados = useMemo(() => {
    const map = new Map<string, {
      clienteId: string; cliente: string; telefono: string;
      cantidadDeudas: number; totalAdeudado: number; deudas: typeof debtDetails;
    }>();
    for (const d of debtDetails) {
      const cid = d.contact_id;
      if (!map.has(cid)) {
        map.set(cid, {
          clienteId: cid,
          cliente: d.contacts?.name ?? "—",
          telefono: d.contacts?.phone_number ?? "—",
          cantidadDeudas: 0,
          totalAdeudado: 0,
          deudas: [],
        });
      }
      const group = map.get(cid)!;
      group.cantidadDeudas++;
      group.totalAdeudado += Number(d.total);
      group.deudas.push(d);
    }
    return Array.from(map.values());
  }, [debtDetails]);

  const toggleClient = (id: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Stats fallback ───────────────────────────────────────
  const stats = {
    totalDeudas: summary?.totalDeudas ?? debtDetails.length,
    totalAdeudado: summary?.totalAdeudado ?? debtDetails.reduce((s, d) => s + Number(d.total), 0),
    deudasVencidas: debtDetails.filter(d => d.debt_status === "Expired").length,
    clientesConDeuda: new Set(debtDetails.filter(d => d.debt_status !== "Paid").map(d => d.contact_id)).size,
  };

  const getEstadoBadge = (status: DebtStatus) => {
    const variants: Record<DebtStatus, string> = {
      Pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
      Active:   "bg-blue-50 text-blue-700 border-blue-200",
      Paid:     "bg-green-50 text-green-700 border-green-200",
      Expired:  "bg-red-50 text-red-700 border-red-200",
    };
    return <Badge variant="outline" className={variants[status]}>{DEBT_STATUS_LABELS[status]}</Badge>;
  };

  const fmt = (v: number) => v.toLocaleString("es-BO", { minimumFractionDigits: 0 });

  const approvedTemplates = useMemo(
    () => templates.filter((template) => String(template.meta_status || "").toUpperCase() === "APPROVED"),
    [templates]
  );

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((template) => template.id === templateId) ?? null,
    [approvedTemplates, templateId]
  );

  const allowedLanguagesForTemplate = useMemo(() => {
    if (!selectedTemplate) return [] as string[];
    const sameNameApproved = approvedTemplates
      .filter((template) => template.template_name === selectedTemplate.template_name)
      .map((template) => String(template.language || "").trim())
      .filter(Boolean);
    return Array.from(new Set(sameNameApproved));
  }, [approvedTemplates, selectedTemplate]);

  const handleTemplateChange = (value: string) => {
    setTemplateId(value);
    const next = approvedTemplates.find((template) => template.id === value) ?? null;
    if (!next) return;
    const langs = Array.from(
      new Set(
        approvedTemplates
          .filter((template) => template.template_name === next.template_name)
          .map((template) => String(template.language || "").trim())
          .filter(Boolean)
      )
    );
    setLanguage(langs[0] || String(next.language || "es_LA"));
  };

  const exportToExcel = () => {
    const data = debtDetails.map(d => ({
      ID: d.id.slice(0, 8),
      Cliente: d.contacts?.name,
      Teléfono: d.contacts?.phone_number,
      Concepto: d.debt_description,
      "Monto (Bs.)": d.debt_amount,
      "Mora (Bs.)": d.penalty_amount,
      "Total (Bs.)": d.total,
      Estado: DEBT_STATUS_LABELS[d.debt_status],
      Vencimiento: d.expiration_date,
      "Días Vencido": d.days_overdue ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deudas");
    XLSX.writeFile(wb, `Deudas_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const openNewDebt = () => {
    if (!tenantId) {
      toast.error("Selecciona un workspace primero.");
      return;
    }
    setNewDebtContactId("");
    setNewDebtAmount("");
    setNewDebtPenalty("");
    setNewDebtDesc("");
    setNewDebtExp(new Date().toISOString().slice(0, 10));
    setShowNewDebt(true);
  };

  const saveNewDebt = async () => {
    if (!tenantId) return;
    if (!newDebtContactId) return toast.error("Selecciona un contacto.");
    const amount = Number(newDebtAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Monto inválido.");
    const penalty = newDebtPenalty ? Number(newDebtPenalty) : 0;
    if (!newDebtExp) return toast.error("Fecha de vencimiento requerida.");

    setSavingDebt(true);
    try {
      await adminDebtsService.create(tenantId, {
        contactId: newDebtContactId,
        items: [{
          amount,
          penalty: Number.isFinite(penalty) ? penalty : 0,
          description: newDebtDesc.trim() || undefined,
          expiration_date: newDebtExp,
        }],
      });
      toast.success("Deuda creada.");
      setShowNewDebt(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la deuda");
    } finally {
      setSavingDebt(false);
    }
  };

  const openImport = () => {
    if (!tenantId) {
      toast.error("Selecciona un workspace primero.");
      return;
    }
    setImportRows([]);
    setShowImport(true);
  };

  const parseExcel = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    const mapped = rows.map((r) => {
      const amount = Number(r.amount ?? r.monto ?? r.debt_amount ?? 0);
      const penalty = Number(r.penalty ?? r.mora ?? r.penalty_amount ?? 0);
      const total = Number(r.total ?? (amount + penalty));
      const expiration_date = String(r.expiration_date ?? r.vencimiento ?? r.fecha_vencimiento ?? "").slice(0, 10);
      return {
        name: r.name ?? r.cliente ?? r.contact_name ?? "",
        phone_number: r.phone_number ?? r.telefono ?? r.phone ?? "",
        email: r.email ?? "",
        amount,
        penalty,
        total,
        description: r.description ?? r.concepto ?? r.debt_description ?? "",
        expiration_date,
      };
    });
    setImportRows(mapped);
    toast.success(`Archivo cargado: ${mapped.length} filas`);
  };

  const runImport = async () => {
    if (!tenantId) return;
    if (importRows.length === 0) return toast.error("No hay filas para importar.");
    setImporting(true);
    try {
      const res = await adminDebtsService.import(tenantId, { rows: importRows });
      if (res.invalid_rows?.length) {
        const sample = res.invalid_rows.slice(0, 3).map((r) => `fila ${r.row}: ${r.reason}`).join(" | ");
        toast.error(`Filas inválidas: ${res.invalid_rows.length}. ${sample}`);
      }
      if (res.errors?.length) {
        toast.error(`Importado con errores: ${res.created_items} items, ${res.errors.length} fallos`);
      } else {
        toast.success(`Importado: ${res.created_items} items (${res.created_contacts} contactos nuevos)`);
      }
      setShowImport(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImporting(false);
    }
  };

  const massFilters = useMemo(() => ({
    min_days_overdue: minDaysOverdue ? Number(minDaysOverdue) : null,
    max_days_overdue: maxDaysOverdue ? Number(maxDaysOverdue) : null,
    min_amount_due: minAmountDue ? Number(minAmountDue) : null,
    max_amount_due: maxAmountDue ? Number(maxAmountDue) : null,
    debt_status: debtStatusForSend || null,
  }), [debtStatusForSend, maxAmountDue, maxDaysOverdue, minAmountDue, minDaysOverdue]);

  const massStepProgress = Math.round((currentStep / 5) * 100);

  const handleCloseModal = () => {
    setShowCobranzasModal(false);
    setCurrentStep(1);
    setMassSendName("");
    setTemplateId("");
    setLanguage("es_LA");
    setMassSendMode("manual");
    setCronExpression("0 9 * * *");
    setMinDaysOverdue("");
    setMaxDaysOverdue("");
    setMinAmountDue("");
    setMaxAmountDue("");
    setDebtStatusForSend("");
    setIncludedContactIds([]);
    setExcludedContactIds([]);
    setConfirmChecked(false);
    setCreatedMassSendId(null);
    previewMutation.reset();
  };

  const validateStep = (step: MassStep) => {
    if (step === 1) {
      if (!massSendName.trim()) {
        toast.error("Define un nombre para el envío.");
        return false;
      }
      if (!templateId) {
        toast.error("Selecciona una plantilla aprobada.");
        return false;
      }
      if (massSendMode === "scheduled" && !cronExpression.trim()) {
        toast.error("La expresión cron es obligatoria en modo programado.");
        return false;
      }
    }
    if (step === 4 && !previewMutation.data) {
      toast.error("Debes generar la vista previa antes de continuar.");
      return false;
    }
    if (step === 5 && !confirmChecked) {
      toast.error("Confirma la revisión final para ejecutar.");
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((prev) => Math.min(5, (prev + 1) as MassStep));
  };

  const prevStep = () => setCurrentStep((prev) => Math.max(1, (prev - 1) as MassStep));

  const runPreview = () => {
    previewMutation.mutate(massFilters, {
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const effectiveTotalRecipients = Math.max(
    0,
    (previewMutation.data?.total_recipients || 0) + includedContactIds.length - excludedContactIds.length
  );

  const executeMassSend = () => {
    if (!validateStep(5)) return;
    createMutation.mutate({
      name: massSendName.trim(),
      template_id: templateId,
      language,
      filters: {
        ...massFilters,
        included_contact_ids: includedContactIds,
        excluded_contact_ids: excludedContactIds,
      },
      mode: massSendMode,
      schedule: massSendMode === "scheduled"
        ? { cron_expression: cronExpression.trim(), timezone: "America/Bogota", enabled: true }
        : null,
    }, {
      onSuccess: ({ mass_send }) => {
        setCreatedMassSendId(mass_send.id);
        if (massSendMode === "manual") {
          runMutation.mutate(mass_send.id, {
            onSuccess: (runResult) => {
              toast.success(`Envío ejecutado. Sent: ${runResult.summary.sent}, failed: ${runResult.summary.failed}, skipped: ${runResult.summary.skipped}`);
              if (runResult.summary.failed > 0 && runResult.failed_samples?.length) {
                const firstFailed = runResult.failed_samples[0];
                const raw = String(firstFailed.error_message || "");
                const hint =
                  /not registered/i.test(raw)
                    ? " WhatsApp/Meta no reconoce ese MSISDN como cuenta activa: revisa que el número en contacto sea exactamente el de WhatsApp (solo dígitos, código país) y que no sea fijo ni duplicado con otro prefijo."
                    : "";
                toast.error(`Motivo de fallo (${firstFailed.phone_number}): ${raw}${hint}`);
              }
              handleCloseModal();
            },
            onError: (err) => toast.error((err as Error).message),
          });
          return;
        }
        toast.success("Envío programado correctamente.");
        handleCloseModal();
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Gestión de Deudas</h1>
          <p className="text-slate-600 mt-2">Administra y visualiza el estado de la cartera de deudas</p>
        </div>
        <Button onClick={() => setShowCobranzasModal(true)} size="lg">
          <Settings className="size-4 mr-2" />Gestionar cobranzas
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={openNewDebt}>
          <DollarSign className="size-4 mr-2" />Nueva deuda
        </Button>
        <Button variant="outline" onClick={openImport}>
          <Download className="size-4 mr-2" />Importar deudas (Excel)
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Deudas", value: stats.totalDeudas, Icon: FileText, color: "blue" },
          { label: "Total Adeudado", value: `Bs. ${fmt(stats.totalAdeudado)}`, Icon: DollarSign, color: "green" },
          { label: "Deudas Vencidas", value: stats.deudasVencidas, Icon: Calendar, color: "red" },
          { label: "Clientes con Deuda", value: stats.clientesConDeuda, Icon: Users, color: "purple" },
        ].map(({ label, value, Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-600">{label}</p>
                <div className={`bg-${color}-50 p-2 rounded-lg`}>
                  <Icon className={`size-5 text-${color}-600`} />
                </div>
              </div>
              {(detailsLoading || summaryLoading) ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-semibold text-slate-900">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, teléfono o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DebtStatus | "all")}>
              <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue placeholder="Ordenar por" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expiration_date_desc">Fecha (más reciente)</SelectItem>
                <SelectItem value="expiration_date_asc">Fecha (más antigua)</SelectItem>
                <SelectItem value="amount_desc">Monto (mayor)</SelectItem>
                <SelectItem value="amount_asc">Monto (menor)</SelectItem>
                <SelectItem value="name_asc">Cliente (A-Z)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportToExcel} variant="outline" className="w-full">
              <Download className="size-4 mr-2" />Exportar
            </Button>
          </div>

          {/* Vista toggle */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600 mr-2">Vista:</p>
            <Button variant={vistaMode === "individual" ? "default" : "outline"} size="sm" onClick={() => setVistaMode("individual")}>
              <FileText className="size-4 mr-2" />Individual
            </Button>
            <Button variant={vistaMode === "agrupada" ? "default" : "outline"} size="sm" onClick={() => setVistaMode("agrupada")}>
              <Users className="size-4 mr-2" />Agrupada por Cliente
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vista Individual */}
      {vistaMode === "individual" && (
        <Card>
          <CardHeader>
            <CardTitle>Listado de Deudas</CardTitle>
            <p className="text-sm text-slate-600">Mostrando {debtDetails.length} deudas</p>
          </CardHeader>
          <CardContent>
            {detailsLoading ? (
              <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {["Cliente", "Teléfono", "Concepto", "Monto", "Total", "Estado", "Vencimiento"].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {debtDetails.map(d => (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-slate-400" />
                            <span className="text-sm text-slate-900">{d.contacts?.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Phone className="size-4 text-slate-400" />
                            <span className="text-sm text-slate-600">{d.contacts?.phone_number ?? "—"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate">{d.debt_description ?? "—"}</td>
                        <td className="py-3 px-4 text-sm text-slate-900 text-right">Bs. {fmt(d.debt_amount)}</td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900 text-right">Bs. {fmt(d.total)}</td>
                        <td className="py-3 px-4">{getEstadoBadge(d.debt_status)}</td>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <p className="text-slate-900">{d.expiration_date}</p>
                            {(d.days_overdue ?? 0) > 0 && (
                              <p className="text-red-600 text-xs">{d.days_overdue} días vencidos</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {debtDetails.length === 0 && (
                  <div className="text-center py-8 text-slate-500">No se encontraron deudas</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vista Agrupada */}
      {vistaMode === "agrupada" && (
        <Card>
          <CardHeader>
            <CardTitle>Deudas Agrupadas por Cliente</CardTitle>
            <p className="text-sm text-slate-600">Mostrando {clientesAgrupados.length} clientes</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clientesAgrupados.map(c => {
                const isExpanded = expandedClients.has(c.clienteId);
                return (
                  <div key={c.clienteId} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div
                      className="bg-slate-50 p-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => toggleClient(c.clienteId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="bg-blue-100 p-3 rounded-lg"><User className="size-6 text-blue-600" /></div>
                          <div>
                            <h3 className="font-medium text-slate-900">{c.cliente}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Phone className="size-3 text-slate-400" />
                              <p className="text-sm text-slate-600">{c.telefono}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-slate-600">Deudas</p>
                            <p className="font-semibold text-slate-900">{c.cantidadDeudas}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-600">Total Adeudado</p>
                            <p className="font-semibold text-lg text-slate-900">Bs. {fmt(c.totalAdeudado)}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="size-5 text-slate-400" /> : <ChevronDown className="size-5 text-slate-400" />}
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-4 bg-white overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200">
                              {["Concepto", "Monto", "Total", "Estado", "Vencimiento"].map(h => (
                                <th key={h} className="text-left py-2 px-3 text-xs font-medium text-slate-600">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.deudas.map(d => (
                              <tr key={d.id} className="border-b border-slate-100">
                                <td className="py-2 px-3 text-sm text-slate-600">{d.debt_description ?? "—"}</td>
                                <td className="py-2 px-3 text-sm text-slate-900 text-right">Bs. {fmt(d.debt_amount)}</td>
                                <td className="py-2 px-3 text-sm font-medium text-slate-900 text-right">Bs. {fmt(d.total)}</td>
                                <td className="py-2 px-3">{getEstadoBadge(d.debt_status)}</td>
                                <td className="py-2 px-3">
                                  <div className="text-sm">
                                    <p className="text-slate-900">{d.expiration_date}</p>
                                    {(d.days_overdue ?? 0) > 0 && (
                                      <p className="text-red-600 text-xs">{d.days_overdue} días vencidos</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gestión de envíos masivos con stepper */}
      <Dialog open={showCobranzasModal} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envíos masivos desde Gestión de Deudas</DialogTitle>
            <DialogDescription>
              Paso {currentStep} de 5 · flujo híbrido con filtros y selección manual de contactos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Progress value={massStepProgress} />
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((step) => (
                <Badge key={step} variant={currentStep === step ? "default" : "outline"}>
                  {step === 1 ? "Plantilla" : step === 2 ? "Filtros" : step === 3 ? "Audiencia" : step === 4 ? "Preview" : "Confirmar"}
                </Badge>
              ))}
            </div>
          </div>

          {currentStep === 1 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mass-send-name">Nombre del envío</Label>
                <Input
                  id="mass-send-name"
                  value={massSendName}
                  onChange={(e) => setMassSendName(e.target.value)}
                  placeholder="Mora vencida - segmento alto riesgo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mass-template">Plantilla aprobada</Label>
                <Select value={templateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger id="mass-template"><SelectValue placeholder="Selecciona plantilla" /></SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.template_name} · {template.language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mass-language">Idioma</Label>
                <Select
                  value={language}
                  onValueChange={setLanguage}
                  disabled={!templateId || allowedLanguagesForTemplate.length === 0}
                >
                  <SelectTrigger id="mass-language">
                    <SelectValue placeholder="Selecciona idioma aprobado" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedLanguagesForTemplate.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mass-mode">Modo</Label>
                <Select value={massSendMode} onValueChange={(v) => setMassSendMode(v as "manual" | "scheduled")}>
                  <SelectTrigger id="mass-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (ejecutar ahora)</SelectItem>
                    <SelectItem value="scheduled">Programado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {massSendMode === "scheduled" ? (
                <div className="space-y-2">
                  <Label htmlFor="mass-cron">Expresión cron</Label>
                  <Input id="mass-cron" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} placeholder="0 9 * * *" />
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mínimo días mora</Label>
                <Input type="number" value={minDaysOverdue} onChange={(e) => setMinDaysOverdue(e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>Máximo días mora</Label>
                <Input type="number" value={maxDaysOverdue} onChange={(e) => setMaxDaysOverdue(e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>Mínimo monto pendiente</Label>
                <Input type="number" value={minAmountDue} onChange={(e) => setMinAmountDue(e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>Máximo monto pendiente</Label>
                <Input type="number" value={maxAmountDue} onChange={(e) => setMaxAmountDue(e.target.value)} min={0} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Estado de deuda (opcional)</Label>
                <Select value={debtStatusForSend || "all"} onValueChange={(v) => setDebtStatusForSend(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowIncludeSelector(true)}>
                  Seleccionar inclusiones ({includedContactIds.length})
                </Button>
                <Button variant="outline" onClick={() => setShowExcludeSelector(true)}>
                  Seleccionar exclusiones ({excludedContactIds.length})
                </Button>
                <Button onClick={runPreview} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? "Calculando..." : "Actualizar preview"}
                </Button>
              </div>
              <div className="rounded-md border p-3 text-sm text-slate-600">
                <p>Base por filtros: <span className="font-medium">{previewMutation.data?.total_recipients ?? 0}</span></p>
                <p>Incluir manual: <span className="font-medium">{includedContactIds.length}</span></p>
                <p>Excluir manual: <span className="font-medium">{excludedContactIds.length}</span></p>
                <p>Total final estimado: <span className="font-semibold">{effectiveTotalRecipients}</span></p>
              </div>
              {previewMutation.data?.sample?.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Muestra de destinatarios por filtro</p>
                  <div className="max-h-56 overflow-y-auto border rounded-md">
                    {previewMutation.data.sample.map((item) => (
                      <div key={item.contact_id} className="flex items-center justify-between px-3 py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm">{item.contact_name}</p>
                          <p className="text-xs text-slate-500">{item.phone_number}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`exclude-${item.contact_id}`} className="text-xs text-slate-500">Excluir</Label>
                          <Checkbox
                            id={`exclude-${item.contact_id}`}
                            checked={excludedContactIds.includes(item.contact_id)}
                            onCheckedChange={(checked) => {
                              setExcludedContactIds((prev) =>
                                checked ? Array.from(new Set([...prev, item.contact_id])) : prev.filter((id) => id !== item.contact_id)
                              );
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No hay preview generado todavía.</p>
              )}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-3">
              <div className="rounded-md border px-2.5 py-2 text-xs text-slate-600 space-y-0.5 leading-snug">
                <p><span className="text-slate-500">Envío</span> <span className="font-medium text-slate-800">{massSendName || "—"}</span></p>
                <p><span className="text-slate-500">Plantilla</span> <span className="font-medium text-slate-800">{templates.find((template) => template.id === templateId)?.template_name || "—"}</span></p>
                <p><span className="text-slate-500">Modo</span> <span className="font-medium text-slate-800">{massSendMode === "manual" ? "Manual" : "Programado"}</span></p>
                <p><span className="text-slate-500">Total</span> <span className="font-semibold text-slate-900">{effectiveTotalRecipients}</span></p>
                {effectiveTotalRecipients <= 0 ? (
                  <p className="text-amber-700">Sin destinatarios estimados.</p>
                ) : null}
              </div>
              {(() => {
                const t = selectedTemplate as any;
                const comps = Array.isArray(t?.components) ? (t.components as Array<Record<string, unknown>>) : [];
                const header = getTemplateComponent<{ format?: string; text?: string }>(comps, "HEADER");
                const body = getTemplateComponent<{ text?: string }>(comps, "BODY");
                const footer = getTemplateComponent<{ text?: string }>(comps, "FOOTER");
                const buttons = getTemplateComponent<{ buttons?: Array<{ type?: string; text?: string }> }>(comps, "BUTTONS");

                const required = Math.max(
                  maxPlaceholderIndex(String(header?.text || "")),
                  maxPlaceholderIndex(String(body?.text || "")),
                  maxPlaceholderIndex(String(footer?.text || "")),
                );
                const exampleParams = Array.from({ length: required }, (_, i) => `Valor ${i + 1}`);
                const resolvedHeaderText = interpolateTemplateText(String(header?.text || ""), exampleParams);
                const resolvedBodyText = interpolateTemplateText(String(body?.text || ""), exampleParams);
                const resolvedFooterText = interpolateTemplateText(String(footer?.text || ""), exampleParams);
                const previewTime = new Date().toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
                const hasButtons = Array.isArray(buttons?.buttons) && buttons.buttons.length > 0;

                return (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">Preview WhatsApp</p>
                        <p className="text-xs text-slate-500">{t?.template_name ? String(t.template_name) : "—"} · {language || "—"}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">Plantilla</Badge>
                    </div>
                    <div
                      className="p-4 antialiased"
                      style={{
                        background: "#efe7dd url('https://cloud.githubusercontent.com/assets/398893/15136779/4e765036-1639-11e6-9201-67e728e86f39.jpg') repeat",
                        fontFamily: WHATSAPP_PREVIEW_FONT_FAMILY,
                        WebkitFontSmoothing: "antialiased",
                        MozOsxFontSmoothing: "grayscale",
                      }}
                    >
                      <div className="mx-auto max-w-[760px]">
                        <div className="max-w-[680px] rounded-[0_6px_6px_6px] border border-[#d8d8d8] bg-[#ffffff] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                          {header ? (
                            <p className="text-[28px] leading-[1.18] font-semibold text-[#111b21] whitespace-pre-wrap">
                              {String(header.format || "").toUpperCase() === "TEXT"
                                ? (resolvedHeaderText || "")
                                : `[${String(header.format || "MEDIA").toUpperCase()}]`}
                            </p>
                          ) : null}

                          <div className={`whitespace-pre-wrap text-[#111b21] ${header ? "mt-1.5" : ""}`} style={{ fontSize: "15px", lineHeight: 1.35 }}>
                            {resolvedBodyText || (required > 0 ? "—" : "No hay BODY en esta plantilla.")}
                          </div>

                          {resolvedFooterText ? (
                            <p className="mt-2 text-[12px] leading-tight text-[#667781] whitespace-pre-wrap">{resolvedFooterText}</p>
                          ) : null}

                          <div className="mt-1.5 flex justify-end text-[11px] text-[#667781]">
                            {previewTime}
                          </div>
                        </div>

                        {hasButtons ? (
                          <div className="mt-1.5 max-w-[680px]">
                            <div className="grid grid-cols-2 gap-1.5">
                              {buttons!.buttons!.map((b, idx) => (
                                <button
                                  key={`ms-prev-btn-${idx}`}
                                  type="button"
                                  className={`rounded-[10px] border border-[#d0d7de] bg-[#f7f8fa] px-3 py-2 text-[14px] font-medium leading-tight text-[#1f9d62] ${buttons!.buttons!.length % 2 === 1 && idx === buttons!.buttons!.length - 1 ? "col-span-2" : ""}`}
                                  disabled
                                >
                                  {b.text || "Botón"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {required > 0 ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <p className="font-medium text-slate-700">Parámetros de ejemplo</p>
                        <p className="mt-1">{exampleParams.map((v, i) => `{{${i + 1}}} → ${v}`).join(" · ")}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">Esta plantilla no usa parámetros posicionales ({{n}}).</p>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p>Nombre: <span className="font-medium">{massSendName}</span></p>
                <p>Destinatarios estimados: <span className="font-medium">{effectiveTotalRecipients}</span></p>
                <p>Incluidos manualmente: <span className="font-medium">{includedContactIds.length}</span></p>
                <p>Excluidos manualmente: <span className="font-medium">{excludedContactIds.length}</span></p>
                <p>Modo: <span className="font-medium">{massSendMode === "manual" ? "Manual (ejecución inmediata)" : "Programado"}</span></p>
                {massSendMode === "scheduled" ? <p>Cron: <span className="font-mono">{cronExpression}</span></p> : null}
                {createdMassSendId ? <p>ID creado: <span className="font-mono">{createdMassSendId}</span></p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="confirm-final-send" checked={confirmChecked} onCheckedChange={(checked) => setConfirmChecked(Boolean(checked))} />
                <Label htmlFor="confirm-final-send">Confirmo que revisé filtros, audiencia y plantilla antes de ejecutar.</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/mensajeria/dashboard")}>Ver impacto en dashboard</Button>
                <Button variant="outline" onClick={() => navigate("/bandeja")}>Ir a Bandeja</Button>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal}>Cancelar</Button>
            {currentStep > 1 ? (
              <Button variant="outline" onClick={prevStep}>Anterior</Button>
            ) : null}
            {currentStep < 5 ? (
              <Button onClick={nextStep}>Siguiente</Button>
            ) : (
              <Button
                onClick={executeMassSend}
                disabled={createMutation.isPending || runMutation.isPending || !confirmChecked}
              >
                {createMutation.isPending || runMutation.isPending
                  ? "Procesando..."
                  : massSendMode === "manual"
                    ? "Crear y ejecutar"
                    : "Crear y programar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactSelectorModal
        open={showIncludeSelector}
        onOpenChange={setShowIncludeSelector}
        contacts={contacts.map((contact) => ({ id: contact.id, nombre: contact.name, telefono: contact.phone_number ?? "", email: contact.email ?? "" }))}
        selectedContactIds={includedContactIds}
        onSelectedContactIdsChange={setIncludedContactIds}
      />

      <Dialog open={showNewDebt} onOpenChange={setShowNewDebt}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nueva deuda</DialogTitle>
            <DialogDescription>Crea una deuda manualmente para un contacto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Select value={newDebtContactId} onValueChange={setNewDebtContactId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un contacto" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} {c.phone_number ? `(${c.phone_number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input value={newDebtAmount} onChange={(e) => setNewDebtAmount(e.target.value)} type="number" min={0} />
              </div>
              <div className="space-y-2">
                <Label>Mora</Label>
                <Input value={newDebtPenalty} onChange={(e) => setNewDebtPenalty(e.target.value)} type="number" min={0} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input value={newDebtDesc} onChange={(e) => setNewDebtDesc(e.target.value)} placeholder="Descripción / concepto" />
            </div>
            <div className="space-y-2">
              <Label>Vencimiento</Label>
              <Input value={newDebtExp} onChange={(e) => setNewDebtExp(e.target.value)} type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDebt(false)}>Cancelar</Button>
            <Button onClick={saveNewDebt} disabled={savingDebt}>
              {savingDebt ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar deudas (Excel)</DialogTitle>
            <DialogDescription>
              Columnas soportadas: name/cliente, phone_number/telefono, email, amount/monto, penalty/mora, description/concepto, expiration_date/vencimiento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) parseExcel(f).catch((err) => toast.error(String(err)));
            }} />
            <div className="text-sm text-slate-600">
              Filas cargadas: <span className="font-medium">{importRows.length}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button onClick={runImport} disabled={importing || importRows.length === 0}>
              {importing ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactSelectorModal
        open={showExcludeSelector}
        onOpenChange={setShowExcludeSelector}
        contacts={contacts.map((contact) => ({ id: contact.id, nombre: contact.name, telefono: contact.phone_number ?? "", email: contact.email ?? "" }))}
        selectedContactIds={excludedContactIds}
        onSelectedContactIdsChange={setExcludedContactIds}
      />
    </div>
  );
}