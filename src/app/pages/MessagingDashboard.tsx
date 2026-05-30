import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { useMessagingMetrics } from "../hooks/useWhatsapp";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function withDayTime(dateValue: string, isEnd = false) {
  const suffix = isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return new Date(`${dateValue}${suffix}`).toISOString();
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

function KpiCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="pt-6">
        <p className="text-xs text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function percentageDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function deltaHint(current: number, previous: number) {
  const delta = percentageDelta(current, previous);
  if (delta === 0) return "Sin cambios vs periodo anterior";
  return `${delta > 0 ? "+" : ""}${delta}% vs periodo anterior`;
}

function shiftDate(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateValue(date);
}

function csvEscape(value: string) {
  const v = String(value ?? "");
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export default function MessagingDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = defaultDateRange();

  const fromValue = searchParams.get("from") || defaults.from;
  const toValue = searchParams.get("to") || defaults.to;
  const conversationState = (searchParams.get("conversation_state") || "all") as "all" | "activo" | "pendiente" | "resuelto";
  const messageType = (searchParams.get("message_type") || "all") as "all" | "text" | "template";
  const windowState = (searchParams.get("window_state") || "all") as "all" | "open" | "closed";
  const templateValue = searchParams.get("template") || "";
  const searchValue = searchParams.get("search") || "";

  const filters = useMemo(() => ({
    from: withDayTime(fromValue, false),
    to: withDayTime(toValue, true),
    conversation_state: conversationState,
    message_type: messageType,
    window_state: windowState,
    template: templateValue || undefined,
    search: searchValue || undefined,
  }), [conversationState, fromValue, messageType, searchValue, templateValue, toValue, windowState]);

  const { data, isLoading, isFetching, error } = useMessagingMetrics(filters);

  const previousFilters = useMemo(() => {
    const currentFrom = new Date(`${fromValue}T00:00:00.000Z`);
    const currentTo = new Date(`${toValue}T00:00:00.000Z`);
    const dayDiff = Math.max(1, Math.round((currentTo.getTime() - currentFrom.getTime()) / 86_400_000) + 1);
    const previousTo = shiftDate(fromValue, -1);
    const previousFrom = shiftDate(previousTo, -(dayDiff - 1));
    return {
      ...filters,
      from: withDayTime(previousFrom, false),
      to: withDayTime(previousTo, true),
    };
  }, [filters, fromValue, toValue]);

  const { data: previousData, isLoading: isPreviousLoading } = useMessagingMetrics(previousFilters);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const detailRows = data?.detail || [];

  const exportCsv = () => {
    if (!detailRows.length) return;
    const headers = ["fecha", "contacto", "telefono", "direccion", "tipo", "template", "preview", "estado_conversacion", "ventana_abierta"];
    const rows = detailRows.map((row) => ([
      new Date(row.created_at).toISOString(),
      row.contact_name,
      row.phone_number || "",
      row.direction,
      row.message_type,
      row.template_name || "",
      row.preview || "",
      row.conversation_state,
      row.window_open ? "si" : "no",
    ]));
    const csv = [headers, ...rows].map((line) => line.map((cell) => csvEscape(String(cell))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mensajeria_detalle_${fromValue}_a_${toValue}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-900 tracking-tight">Dashboard de Mensajeria</h1>
          <p className="text-slate-500 text-sm mt-0.5">Metricas de envio/respuesta y rendimiento de plantillas</p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching ? <Badge variant="outline">Actualizando...</Badge> : null}
          <Button variant="outline" onClick={() => navigate("/mensajeria/masivos")}>Ir a Masivos</Button>
          <Button variant="outline" onClick={() => navigate("/bandeja")}>Ir a Bandeja</Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <div className="space-y-1">
            <label htmlFor="metrics-from" className="text-xs text-slate-600">Desde</label>
            <Input id="metrics-from" type="date" value={fromValue} onChange={(e) => updateFilter("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-to" className="text-xs text-slate-600">Hasta</label>
            <Input id="metrics-to" type="date" value={toValue} onChange={(e) => updateFilter("to", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-conversation-state" className="text-xs text-slate-600">Estado conversacion</label>
            <select id="metrics-conversation-state" className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white" value={conversationState} onChange={(e) => updateFilter("conversation_state", e.target.value)}>
              <option value="all">Todos</option>
              <option value="activo">Activo</option>
              <option value="pendiente">Pendiente</option>
              <option value="resuelto">Resuelto</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-message-type" className="text-xs text-slate-600">Tipo de envio</label>
            <select id="metrics-message-type" className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white" value={messageType} onChange={(e) => updateFilter("message_type", e.target.value)}>
              <option value="all">Todos</option>
              <option value="text">Texto libre</option>
              <option value="template">Plantilla</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-window-state" className="text-xs text-slate-600">Ventana 24h</label>
            <select id="metrics-window-state" className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white" value={windowState} onChange={(e) => updateFilter("window_state", e.target.value)}>
              <option value="all">Todas</option>
              <option value="open">Abierta</option>
              <option value="closed">Cerrada</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-template" className="text-xs text-slate-600">Plantilla</label>
            <Input id="metrics-template" value={templateValue} onChange={(e) => updateFilter("template", e.target.value)} placeholder="payment_overdue_2" />
          </div>
          <div className="space-y-1">
            <label htmlFor="metrics-search" className="text-xs text-slate-600">Busqueda</label>
            <Input id="metrics-search" value={searchValue} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Telefono o contacto" />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200">
          <CardContent className="pt-6 text-sm text-red-700">
            {(error as Error).message || "No se pudieron cargar las metricas"}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard
              title="Mensajes enviados"
              value={data?.kpis.sent_messages ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.sent_messages ?? 0, previousData?.kpis.sent_messages ?? 0)}
            />
            <KpiCard
              title="Mensajes respondidos"
              value={data?.kpis.responded_messages ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.responded_messages ?? 0, previousData?.kpis.responded_messages ?? 0)}
            />
            <KpiCard
              title="Tasa de respuesta"
              value={`${data?.kpis.response_rate ?? 0}%`}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.response_rate ?? 0, previousData?.kpis.response_rate ?? 0)}
            />
            <KpiCard
              title="Plantillas enviadas"
              value={data?.kpis.templates_sent ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.templates_sent ?? 0, previousData?.kpis.templates_sent ?? 0)}
            />
            <KpiCard
              title="Conversaciones activas"
              value={data?.kpis.active_conversations ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.active_conversations ?? 0, previousData?.kpis.active_conversations ?? 0)}
            />
            <KpiCard
              title="Ventana cerrada"
              value={data?.kpis.closed_window_conversations ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.closed_window_conversations ?? 0, previousData?.kpis.closed_window_conversations ?? 0)}
            />
            <KpiCard
              title="Mensajes desde masivos"
              value={data?.kpis.mass_sent_messages ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.mass_sent_messages ?? 0, previousData?.kpis.mass_sent_messages ?? 0)}
            />
            <KpiCard
              title="Ejecuciones masivas"
              value={data?.kpis.mass_send_runs ?? 0}
              hint={isPreviousLoading ? "Comparando..." : deltaHint(data?.kpis.mass_send_runs ?? 0, previousData?.kpis.mass_send_runs ?? 0)}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Serie temporal</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.timeseries || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sent" name="Enviados" fill="#2563eb" />
                  <Bar dataKey="responded" name="Respondidos" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Distribucion de conversaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-slate-600">Activas</span>
                  <span className="font-semibold">{data?.conversation_stats.activo ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-slate-600">Pendientes</span>
                  <span className="font-semibold">{data?.conversation_stats.pendiente ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-slate-600">Resueltas</span>
                  <span className="font-semibold">{data?.conversation_stats.resuelto ?? 0}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Top plantillas enviadas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : data?.template_stats.length ? (
              <div className="space-y-2">
                {data.template_stats.map((row) => (
                  <div key={row.template_name} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm font-medium">{row.template_name}</span>
                    <Badge variant="outline">{row.sent}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No hay plantillas enviadas en el rango seleccionado.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Top contactos por actividad</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : data?.top_contacts.length ? (
              <div className="space-y-2">
                {data.top_contacts.map((row) => (
                  <div key={row.thread_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{row.contact_name}</p>
                      <p className="text-xs text-slate-500">{row.phone_number ?? "Sin telefono"}</p>
                    </div>
                    <Badge variant="outline">{row.total}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No hay actividad para el rango seleccionado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Impacto de envíos masivos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : data?.top_mass_sends?.length ? (
            <div className="space-y-2">
              {data.top_mass_sends.map((row, idx) => (
                <div key={`${row.name}-${idx}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-slate-500">sent {row.sent} · failed {row.failed}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay ejecuciones masivas en el rango seleccionado.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Detalle reciente de mensajes</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!detailRows.length || isLoading}>
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : detailRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-2">Fecha</th>
                    <th className="py-2 pr-2">Contacto</th>
                    <th className="py-2 pr-2">Direccion</th>
                    <th className="py-2 pr-2">Tipo</th>
                    <th className="py-2 pr-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium">{row.contact_name}</p>
                        <p className="text-xs text-slate-500">{row.phone_number ?? "Sin telefono"}</p>
                      </td>
                      <td className="py-2 pr-2">{row.direction === "inbound" ? "Entrante" : "Saliente"}</td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline">{row.message_type === "template" ? "Plantilla" : "Texto"}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-slate-600 max-w-[320px] truncate">{row.preview || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay mensajes en el rango y filtros seleccionados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
