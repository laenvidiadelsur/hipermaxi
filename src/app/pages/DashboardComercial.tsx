import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Users, Bot, UserCog, TrendingUp, ArrowUp, ArrowDown, Download, Calendar, MoreVertical } from "lucide-react";
import {
  mockDashboardStats,
  mockDailyVolume,
  mockPerformanceData,
} from "../data/mockData";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import * as XLSX from "xlsx";

type DateRange = "hoy" | "7dias" | "30dias" | "personalizado";
type AgentFilter = "todos" | "ia" | "humano1" | "humano2" | "humano3";

export default function DashboardComercial() {
  const [dateRange, setDateRange] = useState<DateRange>("7dias");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("todos");

  const stats = [
    {
      title: "Total de Leads",
      value: mockDashboardStats.totalLeads,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      trend: { value: "+8%", isPositive: true },
    },
    {
      title: "Atendidos por IA",
      value: mockDashboardStats.leadsAtendidosIA,
      icon: Bot,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      trend: { value: "+12%", isPositive: true },
    },
    {
      title: "Derivados a Humanos",
      value: mockDashboardStats.leadsDerivados,
      icon: UserCog,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      trend: { value: "-5%", isPositive: true },
    },
    {
      title: "Tasa de Conversión (Citas)",
      value: `${mockDashboardStats.tasaConversion}%`,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      trend: { value: "+15%", isPositive: true },
    },
  ];

  const handleExportToExcel = () => {
    // Preparar datos para exportación
    const exportData = [
      { Sección: "KPIs", Métrica: "", Valor: "" },
      { Sección: "", Métrica: "Total de Leads", Valor: mockDashboardStats.totalLeads },
      { Sección: "", Métrica: "Atendidos por IA", Valor: mockDashboardStats.leadsAtendidosIA },
      { Sección: "", Métrica: "Derivados a Humanos", Valor: mockDashboardStats.leadsDerivados },
      { Sección: "", Métrica: "Tasa de Conversión", Valor: `${mockDashboardStats.tasaConversion}%` },
      { Sección: "", Métrica: "", Valor: "" },
      { Sección: "Gestión de Leads", Métrica: "", Valor: "" },
      ...mockPerformanceData.map((item) => ({
        Sección: "",
        Métrica: item.categoria,
        "Atendidos por IA": item.agenteIA,
        "Derivados a Humanos": item.agenteHumano,
      })),
      { Sección: "", Métrica: "", Valor: "" },
      { Sección: "Volumen Diario", Métrica: "", Valor: "" },
      ...mockDailyVolume.map((item) => ({
        Sección: "",
        Métrica: item.fecha,
        "Leads Diarios": item.comercial,
      })),
    ];

    // Crear workbook y worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Comercial");

    // Generar y descargar archivo
    const fileName = `Dashboard_Comercial_${dateRange}_${agentFilter}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportKPIs = () => {
    const data = [
      { Métrica: "Total de Leads", Valor: mockDashboardStats.totalLeads },
      { Métrica: "Atendidos por IA", Valor: mockDashboardStats.leadsAtendidosIA },
      { Métrica: "Derivados a Humanos", Valor: mockDashboardStats.leadsDerivados },
      { Métrica: "Tasa de Conversión", Valor: `${mockDashboardStats.tasaConversion}%` },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPIs");
    XLSX.writeFile(wb, `KPIs_Comercial_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportGestionLeads = () => {
    const data = mockPerformanceData.map((item) => ({
      Periodo: item.categoria,
      "Atendidos por IA": item.agenteIA,
      "Derivados a Humanos": item.agenteHumano,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gestión de Leads");
    XLSX.writeFile(wb, `Gestion_Leads_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportVolumenDiario = () => {
    const data = mockDailyVolume.map((item) => ({
      Fecha: item.fecha,
      "Leads Diarios": item.comercial,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Volumen Diario");
    XLSX.writeFile(wb, `Volumen_Diario_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportResumen = () => {
    const data = [
      { Métrica: "Promedio diario de leads", Valor: "35" },
      { Métrica: "Tiempo promedio de respuesta", Valor: "2.5 min" },
      { Métrica: "Tasa de éxito IA", Valor: "87.8%" },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `Resumen_Rendimiento_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const getDateRangeLabel = () => {
    const labels: Record<DateRange, string> = {
      hoy: "Hoy",
      "7dias": "Últimos 7 días",
      "30dias": "Últimos 30 días",
      personalizado: "Personalizado",
    };
    return labels[dateRange];
  };

  const getAgentLabel = () => {
    const labels: Record<AgentFilter, string> = {
      todos: "Todos los agentes",
      ia: "IA",
      humano1: "Juan Pérez",
      humano2: "María García",
      humano3: "Carlos López",
    };
    return labels[agentFilter];
  };

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-3xl text-slate-900">Dashboard Comercial</h1>
          <p className="text-slate-600 mt-2">
            Rendimiento del Agente IA Comercial
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-slate-600" />
            <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Rango de fechas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="7dias">Últimos 7 días</SelectItem>
                <SelectItem value="30dias">Últimos 30 días</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Agent Filter */}
          <Select value={agentFilter} onValueChange={(value: AgentFilter) => setAgentFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ia">IA</SelectItem>
              <SelectItem value="humano1">Juan Pérez</SelectItem>
              <SelectItem value="humano2">María García</SelectItem>
              <SelectItem value="humano3">Carlos López</SelectItem>
            </SelectContent>
          </Select>

          {/* Export Button */}
          <Button variant="outline" onClick={handleExportToExcel}>
            <Download className="size-4 mr-2" />
            Exportar a Excel
          </Button>
        </div>
      </div>

      {/* Active Filter Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
        <p className="text-sm text-blue-900">
          <span className="font-medium">Filtros activos:</span> {getDateRangeLabel()} • {getAgentLabel()}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const TrendIcon = stat.trend.isPositive ? ArrowUp : ArrowDown;
          
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-600">{stat.title}</p>
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <Icon className={`size-5 ${stat.color}`} />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-semibold text-slate-900">
                    {stat.value}
                  </p>
                  <div className={`flex items-center gap-1 text-xs font-medium ${
                    stat.trend.isPositive ? "text-green-600" : "text-red-600"
                  }`}>
                    <TrendIcon className="size-3" />
                    <span>{stat.trend.value}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Export KPIs Button */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={exportKPIs}>
          <Download className="size-4 mr-2" />
          Exportar KPIs
        </Button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Gestión de Leads</CardTitle>
                <p className="text-sm text-slate-600">
                  Leads atendidos por IA vs derivados a humanos
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportGestionLeads}>
                    <Download className="size-4 mr-2" />
                    Exportar a Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={mockPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="categoria"
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="agenteIA"
                  fill="#8b5cf6"
                  name="Atendidos por IA"
                  radius={[8, 8, 0, 0]}
                />
                <Bar
                  dataKey="agenteHumano"
                  fill="#f97316"
                  name="Derivados a Humanos"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Line Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Volumen Diario de Atención</CardTitle>
                <p className="text-sm text-slate-600">
                  Leads atendidos por día
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportVolumenDiario}>
                    <Download className="size-4 mr-2" />
                    Exportar a Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={mockDailyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="fecha"
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="comercial"
                  stroke="#3b82f6"
                  name="Leads Diarios"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#3b82f6" }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle>Resumen de Rendimiento</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportResumen}>
                  <Download className="size-4 mr-2" />
                  Exportar a Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Promedio diario de leads</p>
              <p className="text-2xl font-semibold text-slate-900">35</p>
              <div className="flex items-center gap-1 text-xs text-green-600">
                <ArrowUp className="size-3" />
                <span>12% vs semana anterior</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Tiempo promedio de respuesta
              </p>
              <p className="text-2xl font-semibold text-slate-900">2.5 min</p>
              <div className="flex items-center gap-1 text-xs text-green-600">
                <ArrowDown className="size-3" />
                <span>18% vs semana anterior</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Tasa de éxito IA</p>
              <p className="text-2xl font-semibold text-slate-900">87.8%</p>
              <div className="flex items-center gap-1 text-xs text-green-600">
                <ArrowUp className="size-3" />
                <span>5% vs semana anterior</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
