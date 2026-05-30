import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Bell, DollarSign, TrendingUp, Percent, ArrowUp, ArrowDown, Download, Calendar, MoreVertical,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Skeleton } from "../components/ui/skeleton";
import * as XLSX from "xlsx";
import { useCobranzasKPIs, useWeeklyActivity, useDailyCollection, useClientStatusDistribution } from "../hooks/useDashboard";
import type { DateRangeKey } from "../services/dashboard.service";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0 }).format(v);

const DATE_RANGE_LABELS: Record<DateRangeKey, string> = {
  hoy: "Hoy",
  "7dias": "Últimos 7 días",
  "30dias": "Últimos 30 días",
};

export default function DashboardCobranzas() {
  const [dateRange, setDateRange] = useState<DateRangeKey>("7dias");

  // ── Real Supabase data ────────────────────────────────────
  const { data: kpis, isLoading: kpisLoading } = useCobranzasKPIs(dateRange);
  const { data: weeklyActivity = [], isLoading: weeklyLoading } = useWeeklyActivity();
  const { data: dailyCollection = [], isLoading: dailyLoading } = useDailyCollection(7);
  const { data: statusDist = [], isLoading: statusLoading } = useClientStatusDistribution();

  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();
    // KPIs sheet
    const kpiData = [
      { Métrica: "Total de Recordatorios", Valor: kpis?.totalRecordatorios ?? 0 },
      { Métrica: "Total Recaudado (Bs.)", Valor: kpis?.totalRecaudado ?? 0 },
      { Métrica: "Promedio de Pago (Bs.)", Valor: kpis?.promedioRecaudacion ?? 0 },
      { Métrica: "Tasa de Recuperación (%)", Valor: kpis?.tasaRecuperacion ?? 0 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiData), "KPIs");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyActivity), "Actividad Semanal");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyCollection), "Recaudación Diaria");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusDist), "Estado Clientes");
    XLSX.writeFile(wb, `Dashboard_Cobranzas_${dateRange}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const kpiCards = [
    {
      title: "Total de Recordatorios",
      value: kpis ? String(kpis.totalRecordatorios) : "—",
      icon: Bell, color: "text-blue-600", bgColor: "bg-blue-50",
      trend: { value: "", isPositive: true },
    },
    {
      title: "Total Recaudado",
      value: kpis ? `Bs. ${formatCurrency(kpis.totalRecaudado)}` : "—",
      icon: DollarSign, color: "text-green-600", bgColor: "bg-green-50",
      trend: { value: "", isPositive: true },
    },
    {
      title: "Promedio de Pago",
      value: kpis ? `Bs. ${formatCurrency(kpis.promedioRecaudacion)}` : "—",
      icon: TrendingUp, color: "text-purple-600", bgColor: "bg-purple-50",
      trend: { value: "", isPositive: true },
    },
    {
      title: "Tasa de Recuperación",
      value: kpis ? `${kpis.tasaRecuperacion}%` : "—",
      icon: Percent, color: "text-orange-600", bgColor: "bg-orange-50",
      trend: { value: "", isPositive: true },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Dashboard Cobranzas</h1>
          <p className="text-slate-600 mt-2">Rendimiento del Agente IA de Cobranzas</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-slate-600" />
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="7dias">Últimos 7 días</SelectItem>
                <SelectItem value="30dias">Últimos 30 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExportToExcel}>
            <Download className="size-4 mr-2" />Exportar a Excel
          </Button>
        </div>
      </div>

      {/* Period indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
        <p className="text-sm text-blue-900">
          <span className="font-medium">Periodo seleccionado:</span> {DATE_RANGE_LABELS[dateRange]}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="p-6 pb-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">{stat.title}</p>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className={`${stat.bgColor} p-2 rounded-lg w-fit mb-3`}>
                  <Icon className={`size-5 ${stat.color}`} />
                </div>
                {kpisLoading ? (
                  <Skeleton className="h-8 w-28" />
                ) : (
                  <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart – Weekly Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Actividad de Cobranzas</CardTitle>
                <p className="text-sm text-slate-600">Recordatorios enviados vs pagos recibidos</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm"><MoreVertical className="size-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(weeklyActivity);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Actividad");
                    XLSX.writeFile(wb, `Actividad_${new Date().toISOString().split("T")[0]}.xlsx`);
                  }}>
                    <Download className="size-4 mr-2" />Exportar a Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            {weeklyLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={weeklyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="categoria" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }} />
                  <Legend />
                  <Bar dataKey="recordatorios" fill="#3b82f6" name="Recordatorios Enviados" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pagos" fill="#10b981" name="Pagos Recibidos" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Line Chart – Daily Collection */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Recaudación Diaria</CardTitle>
                <p className="text-sm text-slate-600">Monto recaudado por día</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm"><MoreVertical className="size-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(dailyCollection);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Recaudación");
                    XLSX.writeFile(wb, `Recaudacion_${new Date().toISOString().split("T")[0]}.xlsx`);
                  }}>
                    <Download className="size-4 mr-2" />Exportar a Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dailyCollection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${formatCurrency(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                    formatter={(v: number) => `Bs. ${formatCurrency(v)}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="monto" stroke="#10b981" name="Monto Recaudado (Bs.)" strokeWidth={3} dot={{ r: 5, fill: "#10b981" }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estado de Clientes */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Estado de Clientes</CardTitle>
              <p className="text-sm text-slate-600">Distribución de clientes por estado de pago</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm"><MoreVertical className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  const ws = XLSX.utils.json_to_sheet(statusDist);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Estado Clientes");
                  XLSX.writeFile(wb, `Estado_Clientes_${new Date().toISOString().split("T")[0]}.xlsx`);
                }}>
                  <Download className="size-4 mr-2" />Exportar a Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {statusDist.map((item) => {
                const colors: Record<string, { bg: string; text: string; border: string }> = {
                  Pendiente:   { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
                  "En seguimiento": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                  Pagado:      { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
                  Vencido:     { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
                };
                const c = colors[item.estado] ?? colors.Pendiente;
                return (
                  <div key={item.estado} className={`border-2 rounded-lg p-4 ${c.bg} ${c.border}`}>
                    <p className={`text-sm font-medium mb-2 ${c.text}`}>{item.estado}</p>
                    <p className="text-3xl font-semibold text-slate-900 mb-1">{item.cantidad}</p>
                    <p className={`text-xs ${c.text}`}>{item.porcentaje}% del total</p>
                  </div>
                );
              })}
              {statusDist.length === 0 && (
                <div className="col-span-4 text-center py-8 text-slate-500">Sin datos de estado para el período</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary insights (static computed metrics) */}
      <Card>
        <CardHeader><CardTitle>Resumen de Rendimiento</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Promedio de recaudación diaria</p>
              {kpisLoading ? <Skeleton className="h-8 w-28" /> : (
                <p className="text-2xl font-semibold text-slate-900">
                  Bs. {formatCurrency((kpis?.totalRecaudado ?? 0) / 7)}
                </p>
              )}
              <div className="flex items-center gap-1 text-xs text-green-600">
                <ArrowUp className="size-3" /><span>basado en {DATE_RANGE_LABELS[dateRange]}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Tasa de recuperación</p>
              {kpisLoading ? <Skeleton className="h-8 w-20" /> : (
                <p className="text-2xl font-semibold text-slate-900">{kpis?.tasaRecuperacion ?? 0}%</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Total recordatorios enviados</p>
              {kpisLoading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-2xl font-semibold text-slate-900">{kpis?.totalRecordatorios ?? 0}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}