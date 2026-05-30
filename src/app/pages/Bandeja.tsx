import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import {
  Search, MessageSquare, Phone, Clock, Bot, User, CheckCheck, Send,
  X, Plus, ChevronRight, Loader2, UserSearch,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useThreads,
  useMessages,
  useRealtimeMessages,
  useRealtimeThreads,
  THREADS_KEY,
  MESSAGES_KEY,
} from "../hooks/useThreads";
import { threadsService } from "../services/threads.service";
import { whatsappService } from "../services/whatsapp.service";
import { getAdminApiBase } from "../services/admin.service";
import { useAuth } from "../context/AuthContext";
import type { ThreadWithContact, Contact } from "../data/supabase.types";
import { supabase } from "../../lib/supabase";

// ── Small helper: debounce ──────────────────────────────────────
function useDebounce<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const RICH_MSG_PREFIX = "__AIC_MSG__";
type RichMessage = {
  kind: "text" | "image" | "audio" | "video" | "document" | "template" | "interactive" | "button" | string;
  text?: string;
  media_url?: string | null;
  filename?: string | null;
  mime_type?: string | null;
  caption?: string | null;
  template_name?: string | null;
  language?: string | null;
  media_id?: string | null;
  components?: Array<Record<string, unknown>>;
  template_components?: Array<Record<string, unknown>>;
  sent_components?: Array<Record<string, unknown>>;
};

function parseRichMessage(raw: string | null): RichMessage | null {
  const text = String(raw || "");
  if (!text) return null;
  const normalized = text.trimStart();
  const prefixIndex = normalized.indexOf(RICH_MSG_PREFIX);
  if (prefixIndex < 0) return null;
  try {
    const jsonStart = normalized.indexOf("{", prefixIndex + RICH_MSG_PREFIX.length);
    if (jsonStart < 0) return null;
    const parsed = JSON.parse(normalized.slice(jsonStart));
    return parsed as RichMessage;
  } catch {
    return null;
  }
}

function extractSentBodyParams(components: Array<Record<string, unknown>>): string[] {
  return components.flatMap((c) => {
    const cType = String((c as { type?: string }).type || "").toUpperCase();
    if (cType !== "BODY") return [];
    const params = (c as { parameters?: Array<{ text?: string }> }).parameters;
    if (!Array.isArray(params)) return [];
    return params.map((p) => String(p?.text || "").trim()).filter(Boolean);
  });
}

function interpolateTemplateBody(bodyText: string, params: string[]): string {
  if (!bodyText) return "";
  if (!params.length) return bodyText;
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, indexRaw: string) => {
    const index = Number(indexRaw) - 1;
    return index >= 0 && index < params.length ? params[index] : `{{${indexRaw}}}`;
  });
}

type SendComposerProps = {
  activePhone: string;
  isWindowOpen: boolean;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  templatesLoading: boolean;
  sendTemplatePending: boolean;
  approvedTemplates: Array<{ id: string; template_name: string }>;
  onSendTemplate: () => void;
  message: string;
  setMessage: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  sendPending: boolean;
  onSend: () => void;
};

function SendComposer({
  activePhone,
  isWindowOpen,
  selectedTemplateId,
  setSelectedTemplateId,
  templatesLoading,
  sendTemplatePending,
  approvedTemplates,
  onSendTemplate,
  message,
  setMessage,
  onKeyDown,
  messageInputRef,
  sendPending,
  onSend,
}: SendComposerProps) {
  if (!activePhone) {
    return (
      <p className="text-xs text-amber-600 text-center py-2">
        Este contacto no tiene número de WhatsApp registrado.
      </p>
    );
  }

  if (!isWindowOpen) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          Ventana de 24h cerrada. Solo puedes enviar plantilla aprobada hasta que el cliente responda.
        </p>
        <div className="flex items-center gap-2">
          <select
            id="bandeja-template-select"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="flex-1 h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={templatesLoading || sendTemplatePending}
          >
            <option value="">
              {templatesLoading ? "Cargando plantillas..." : "Selecciona plantilla aprobada"}
            </option>
            {approvedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.template_name}
              </option>
            ))}
          </select>
          <Button
            id="bandeja-send-template-btn"
            className="h-10 rounded-xl px-4"
            onClick={onSendTemplate}
            disabled={!selectedTemplateId || sendTemplatePending}
          >
            {sendTemplatePending ? <Loader2 className="size-4 animate-spin" /> : "Enviar plantilla"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        id="bandeja-message-input"
        ref={messageInputRef}
        placeholder="Escribe un mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        className="flex-1 resize-none max-h-32 text-sm border-slate-200 bg-slate-50 focus-visible:ring-blue-500 rounded-xl overflow-y-auto"
        style={{ minHeight: "42px", height: "auto" }}
        disabled={sendPending}
      />
      <Button
        id="bandeja-send-btn"
        size="icon"
        className={`shrink-0 size-[42px] rounded-xl transition-all ${
          message.trim() && !sendPending
            ? "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-blue-200"
            : "bg-slate-200 cursor-not-allowed"
        }`}
        onClick={onSend}
        disabled={!message.trim() || sendPending}
        aria-label="Enviar mensaje"
      >
        {sendPending ? (
          <Loader2 className="size-4 animate-spin text-slate-500" />
        ) : (
          <Send className={`size-4 ${message.trim() ? "text-white" : "text-slate-400"}`} />
        )}
      </Button>
    </div>
  );
}

function ProtectedMedia({
  mediaId,
  fallbackUrl,
  mimeType,
  kind,
  isAgent,
}: {
  mediaId?: string | null;
  fallbackUrl?: string | null;
  mimeType?: string | null;
  kind: "image" | "audio" | "video" | "document";
  isAgent: boolean;
}) {
  const { tenantId } = useAuth();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(fallbackUrl || null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      if (!mediaId || !tenantId) {
        setResolvedUrl(fallbackUrl || null);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("No session");
        const adminBase = getAdminApiBase();
        const res = await fetch(`${adminBase}/api/meta/media/${encodeURIComponent(mediaId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": tenantId,
          },
        });
        if (!res.ok) throw new Error("proxy failed");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setResolvedUrl(objectUrl);
      } catch {
        if (!cancelled) setResolvedUrl(fallbackUrl || null);
      }
    };

    run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, tenantId, fallbackUrl]);

  if (!resolvedUrl) {
    return (
      <div className={`rounded-lg border px-3 py-2 text-xs ${isAgent ? "border-blue-300/40 bg-blue-500/20 text-blue-100" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
        {kind === "image" ? "Imagen recibida (sin URL disponible)" : kind === "audio" ? "Audio recibido (sin URL reproducible)" : kind === "video" ? "Video recibido (sin URL disponible)" : "Documento recibido (sin URL disponible)"}
      </div>
    );
  }

  if (kind === "image") {
    return (
      <a href={resolvedUrl} target="_blank" rel="noreferrer">
        <img src={resolvedUrl} alt="Imagen recibida" className="max-h-64 w-full rounded-lg object-cover border border-black/10" />
      </a>
    );
  }
  if (kind === "audio") {
    return (
      <audio controls className="w-full">
        <source src={resolvedUrl} type={mimeType || "audio/mpeg"} />
      </audio>
    );
  }
  if (kind === "video") {
    return (
      <video controls className="max-h-64 w-full rounded-lg border border-black/10">
        <source src={resolvedUrl} type={mimeType || "video/mp4"} />
      </video>
    );
  }
  return (
    <a href={resolvedUrl} target="_blank" rel="noreferrer" className={`text-xs underline ${isAgent ? "text-blue-100" : "text-blue-700"}`}>
      Abrir documento
    </a>
  );
}

export function Bandeja() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI State
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"threads" | "new-contact">("threads");
  const [pendingContact, setPendingContact] = useState<Contact | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [threadStateFilter, setThreadStateFilter] = useState<"all" | "activo" | "pendiente" | "resuelto">(
    (searchParams.get("estado") as "all" | "activo" | "pendiente" | "resuelto") || "all"
  );
  const [windowFilter, setWindowFilter] = useState<"all" | "open" | "closed">(
    (searchParams.get("window") as "all" | "open" | "closed") || "all"
  );

  // Read contact from navigation state (coming from Contactos page)
  useEffect(() => {
    const navContact = (location.state as { contact?: Contact } | null)?.contact;
    if (navContact) {
      setPendingContact(navContact);
      setSelectedThreadId(null);
      // Clear the navigation state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} });
      // Auto-focus the input
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [location.state]);

  // Contact search for "new chat"
  const debouncedSearch = useDebounce(searchTerm, 350);

  // ── Data ──────────────────────────────────────────────────────
  const { data: threads = [], isLoading: threadsLoading } = useThreads();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedThreadId);

  // Realtime
  const realtimeMessages = useRealtimeMessages(selectedThreadId);
  const allMessages = useMemo(() => [
    ...messages,
    ...realtimeMessages.filter(rm => !messages.some(m => m.id === rm.id)),
  ], [messages, realtimeMessages]);

  const onThreadsUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [THREADS_KEY, tenantId] });
    // Incoming messages update whatsapp_threads in realtime; ensure the open thread refetches messages
    if (selectedThreadId) {
      qc.invalidateQueries({ queryKey: [MESSAGES_KEY, selectedThreadId] });
    }
  }, [qc, tenantId, selectedThreadId]);
  useRealtimeThreads(tenantId, onThreadsUpdate);

  // Mark-read when selecting thread
  useEffect(() => {
    if (selectedThreadId) {
      threadsService.markThreadRead(selectedThreadId).catch(() => null);
      qc.invalidateQueries({ queryKey: [MESSAGES_KEY, selectedThreadId] });
    }
  }, [selectedThreadId, qc]);

  // Auto-scroll to bottom when messages change
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  // ── Contact search (for new chat) ─────────────────────────────
  const { data: contactResults = [], isFetching: contactSearching } = useQuery({
    queryKey: ["contact-search", tenantId, debouncedSearch],
    queryFn: () => whatsappService.searchContacts(tenantId!, debouncedSearch),
    enabled: mode === "new-contact" && !!tenantId && debouncedSearch.length >= 1,
    staleTime: 30_000,
  });
  const { data: approvedTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["approved-templates", tenantId],
    queryFn: () => whatsappService.getApprovedTemplates(tenantId!),
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No hay workspace seleccionado");
      const phoneNumber = selectedThread?.contacts?.phone_number ?? pendingContact?.phone_number;
      if (!phoneNumber) throw new Error("Este contacto no tiene número de WhatsApp");
      if (!isWindowOpen) throw new Error("Ventana de 24h cerrada. Usa una plantilla aprobada.");
      return whatsappService.sendMessage(tenantId, {
        phone_number: phoneNumber,
        message_text: message.trim(),
        thread_id: selectedThreadId ?? undefined,
      });
    },
    onSuccess: async (result) => {
      const sentToPhone = selectedThread?.contacts?.phone_number ?? pendingContact?.phone_number;
      setMessage("");
      await qc.invalidateQueries({ queryKey: [MESSAGES_KEY, selectedThreadId] });
      await qc.invalidateQueries({ queryKey: [THREADS_KEY, tenantId] });

      // If this came from "new chat" flow, try selecting the created/reused thread.
      if (!selectedThreadId && tenantId && sentToPhone) {
        const refreshedThreads = await qc.fetchQuery({
          queryKey: [THREADS_KEY, tenantId],
          queryFn: () => threadsService.getThreads(tenantId),
        });
        const matchedThread = refreshedThreads.find(
          (thread) => thread.contacts?.phone_number === sentToPhone
        );
        if (matchedThread) {
          setSelectedThreadId(matchedThread.id);
          setPendingContact(null);
        }
      }

      // Optimistically show sent message immediately
      if (result?.message) {
        // Realtime will pick it up via Supabase channels
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "No se pudo enviar el mensaje", {
        description: err.message.includes("Ventana") || err.message.includes("window")
          ? "La ventana de 24hs expiró. Inicia la conversación con una plantilla."
          : undefined,
      });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No hay workspace seleccionado");
      if (!activePhone) throw new Error("Este contacto no tiene número de WhatsApp");
      if (!selectedTemplateId) throw new Error("Selecciona una plantilla aprobada");
      return whatsappService.sendTemplateMessage(tenantId, {
        phone_number: activePhone,
        template_id: selectedTemplateId,
        thread_id: selectedThreadId ?? undefined,
      });
    },
    onSuccess: async () => {
      setMessage("");
      await qc.invalidateQueries({ queryKey: [MESSAGES_KEY, selectedThreadId] });
      await qc.invalidateQueries({ queryKey: [THREADS_KEY, tenantId] });

      if (!selectedThreadId && tenantId && activePhone) {
        const refreshedThreads = await qc.fetchQuery({
          queryKey: [THREADS_KEY, tenantId],
          queryFn: () => threadsService.getThreads(tenantId),
        });
        const matchedThread = refreshedThreads.find(
          (thread) => thread.contacts?.phone_number === activePhone
        );
        if (matchedThread) {
          setSelectedThreadId(matchedThread.id);
          setPendingContact(null);
        }
      }
      toast.success("Plantilla enviada correctamente");
    },
    onError: (err: Error) => {
      toast.error(err.message || "No se pudo enviar la plantilla");
    },
  });

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  const handleSendTemplate = () => {
    if (sendTemplateMutation.isPending) return;
    sendTemplateMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start chat from a contact search result
  const handleStartChat = async (contact: Contact) => {
    if (!tenantId || !contact.phone_number) {
      toast.error("Este contacto no tiene número de WhatsApp registrado");
      return;
    }
    // Select existing thread if any
    const existingThread = threads.find(
      t => t.contacts?.phone_number === contact.phone_number
    );
    if (existingThread) {
      setSelectedThreadId(existingThread.id);
      setPendingContact(null);
      setMode("threads");
      setSearchTerm("");
      return;
    }
    // No existing thread — store as pending contact
    setPendingContact(contact);
    setMode("threads");
    setSearchTerm("");
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchTerm.trim()) next.set("q", searchTerm.trim());
    if (threadStateFilter !== "all") next.set("estado", threadStateFilter);
    if (windowFilter !== "all") next.set("window", windowFilter);
    setSearchParams(next, { replace: true });
  }, [searchTerm, threadStateFilter, windowFilter, setSearchParams]);

  // ── Filtering (threads mode) ───────────────────────────────────
  const filteredThreads = threads.filter((t) => {
    const q = searchTerm.toLowerCase();
    const estado = getEstado(t);
    if (threadStateFilter !== "all" && estado !== threadStateFilter) return false;
    if (windowFilter === "open" && !t.window_open) return false;
    if (windowFilter === "closed" && t.window_open) return false;
    return (
      (t.contacts?.name ?? "").toLowerCase().includes(q) ||
      (t.contacts?.phone_number ?? "").includes(searchTerm) ||
      t.id.toLowerCase().includes(q)
    );
  });

  const selectedThread: ThreadWithContact | null =
    threads.find(t => t.id === selectedThreadId) ?? null;

  // Active thread details (may be pendingContact when no thread yet)
  const activeContactName = selectedThread?.contacts?.name ?? pendingContact?.name ?? "";
  const activePhone = selectedThread?.contacts?.phone_number ?? pendingContact?.phone_number ?? "";
  const isActive = !!selectedThread || !!pendingContact;
  const isWindowOpen = selectedThread?.window_open ?? false;
  const hasMassSendOrigin = allMessages.some((msg) => !msg.incoming && !!msg.mass_send_id);

  // ── Helpers ───────────────────────────────────────────────────
  const formatRelativeTime = (iso: string | null) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  function getEstado(t: ThreadWithContact): "activo" | "resuelto" | "pendiente" {
    if (!t.last_interaction) return "pendiente";
    const hrs = (Date.now() - new Date(t.last_interaction).getTime()) / 3_600_000;
    if (hrs < 1) return "activo";
    if (hrs < 48) return "pendiente";
    return "resuelto";
  }

  const estadoBadge = (estado: string) => {
    const cfg: Record<string, { className: string; label: string }> = {
      activo:    { className: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Activo" },
      resuelto:  { className: "bg-slate-100 text-slate-600 border-slate-200",     label: "Resuelto" },
      pendiente: { className: "bg-amber-50 text-amber-700 border-amber-200",       label: "Pendiente" },
    };
    const c = cfg[estado] ?? cfg.pendiente;
    return <Badge variant="outline" className={`text-[10px] font-medium ${c.className}`}>{c.label}</Badge>;
  };

  useEffect(() => {
    setSelectedTemplateId("");
  }, [selectedThreadId, pendingContact?.id]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-900 tracking-tight">Bandeja de Mensajes</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {threads.length} conversación{threads.length !== 1 ? "es" : ""} · Realtime activado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/mensajeria/dashboard")}>
            Ver métricas
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/mensajeria/masivos")}>
            Ir a Masivos
          </Button>
          <Button
            size="sm"
            variant={mode === "new-contact" ? "default" : "outline"}
            onClick={() => {
              setMode(m => m === "new-contact" ? "threads" : "new-contact");
              setSearchTerm("");
            }}
            className="gap-1.5"
          >
            {mode === "new-contact" ? (
              <><X className="size-3.5" /> Cancelar</>
            ) : (
              <><Plus className="size-3.5" /> Nuevo chat</>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">Filtros</p>
          <select
            value={threadStateFilter}
            onChange={(e) => setThreadStateFilter(e.target.value as "all" | "activo" | "pendiente" | "resuelto")}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="all">Estado: todos</option>
            <option value="activo">Estado: activo</option>
            <option value="pendiente">Estado: pendiente</option>
            <option value="resuelto">Estado: resuelto</option>
          </select>
          <select
            value={windowFilter}
            onChange={(e) => setWindowFilter(e.target.value as "all" | "open" | "closed")}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="all">Ventana: todas</option>
            <option value="open">Ventana: abierta</option>
            <option value="closed">Ventana: cerrada</option>
          </select>
        </div>
      </div>

      {/* Main chat container */}
      <Card className="h-[calc(100vh-150px)] min-h-[640px] overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="p-0 h-full">
          <div className="flex h-full">

            {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
            <div className="w-[278px] lg:w-[300px] xl:w-[322px] shrink-0 border-r border-slate-100 flex flex-col bg-white">

              {/* Search bar */}
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
                  {mode === "new-contact"
                    ? <UserSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-blue-500 pointer-events-none" />
                    : null}
                  <Input
                    id="bandeja-search"
                    placeholder={mode === "new-contact" ? "Buscar contacto..." : "Buscar conversación..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 text-sm h-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
                  />
                  {contactSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 animate-spin" />
                  )}
                </div>
              </div>

              {/* List body */}
              <div className="flex-1 overflow-y-auto">

                {/* ── NEW CONTACT MODE ── */}
                {mode === "new-contact" ? (
                  debouncedSearch.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center gap-2">
                      <UserSearch className="size-10 text-slate-300" />
                      <p className="text-sm font-medium">Escribe un nombre o teléfono</p>
                      <p className="text-xs">Buscaremos entre tus contactos registrados</p>
                    </div>
                  ) : contactResults.length === 0 && !contactSearching ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center gap-2">
                      <Search className="size-10 text-slate-300" />
                      <p className="text-sm font-medium">Sin resultados</p>
                      <p className="text-xs">Agrega el cliente desde la sección Contactos</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {contactResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleStartChat(c)}
                          className="w-full flex items-center gap-3 p-3.5 hover:bg-blue-50 transition-colors text-left group"
                        >
                          <div className="bg-blue-100 size-10 rounded-full flex items-center justify-center shrink-0">
                            <User className="size-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 truncate">{c.name}</p>
                            <p className="text-xs text-slate-500 truncate">{c.phone_number ?? "Sin número"}</p>
                          </div>
                          <ChevronRight className="size-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                        </button>
                      ))}
                    </div>
                  )

                /* ── THREADS MODE ── */
                ) : threadsLoading ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="size-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-2.5 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center gap-2">
                    <MessageSquare className="size-10 text-slate-300" />
                    <p className="text-sm font-medium">
                      {searchTerm ? "Sin resultados" : "Sin conversaciones"}
                    </p>
                    <p className="text-xs">
                      {searchTerm ? "Prueba otro término" : 'Usa "Nuevo chat" para iniciar'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {filteredThreads.map((t) => {
                      const estado = getEstado(t);
                      const isSelected = selectedThreadId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedThreadId(t.id); setPendingContact(null); }}
                          className={`w-full flex items-start gap-3 p-3.5 transition-colors text-left ${
                            isSelected
                              ? "bg-blue-50 border-l-2 border-l-blue-600"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                            estado === "activo" ? "bg-emerald-100" : "bg-slate-100"
                          }`}>
                            <User className={`size-5 ${estado === "activo" ? "text-emerald-600" : "text-slate-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-semibold text-sm text-slate-900 truncate">
                                {t.contacts?.name ?? "Desconocido"}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {formatRelativeTime(t.last_interaction)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mb-1.5">{t.last_message ?? "—"}</p>
                            {estadoBadge(estado)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: CHAT PANEL ─────────────────────────────── */}
            <div className="flex-1 flex flex-col bg-[#f7f8fc] min-w-0">
              {!isActive ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  <div className="bg-slate-100 p-5 rounded-full">
                    <MessageSquare className="size-10 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-600">Selecciona una conversación</p>
                    <p className="text-sm mt-1">o inicia un nuevo chat con un contacto</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 size-10 rounded-full flex items-center justify-center">
                        <User className="size-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-900 leading-tight">{activeContactName}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <Phone className="size-3 text-slate-400" />
                          <span className="text-xs leading-none text-slate-500">{activePhone}</span>
                          {selectedThread && (
                            <span className="text-slate-300 leading-none">·</span>
                          )}
                          {selectedThread && estadoBadge(getEstado(selectedThread))}
                          {isActive && (
                            <Badge
                              variant="outline"
                              className={`inline-flex items-center h-5 text-[10px] leading-none font-medium ${
                                isWindowOpen
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {isWindowOpen ? "Ventana activa" : "Solo plantilla"}
                            </Badge>
                          )}
                          {hasMassSendOrigin ? (
                            <Badge
                              variant="outline"
                              className="inline-flex items-center h-5 text-[10px] leading-none font-medium bg-violet-50 text-violet-700 border-violet-200"
                            >
                              Origen: envío masivo
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-slate-400 hover:text-slate-600"
                      onClick={() => { setSelectedThreadId(null); setPendingContact(null); }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  {/* Messages area */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3.5">
                    <div className="sticky top-0 z-10 -mt-5 mb-3 bg-[#f7f8fc]/90 backdrop-blur-sm pt-5 flex justify-center">
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
                        Conversación
                      </div>
                    </div>
                    {messagesLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                            <Skeleton className={`h-14 rounded-2xl ${i % 2 === 0 ? "w-64" : "w-48"}`} />
                          </div>
                        ))}
                      </div>
                    ) : allMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                        <MessageSquare className="size-8 text-slate-300" />
                        <p className="text-sm">Sin mensajes aún. ¡Sé el primero en escribir!</p>
                      </div>
                    ) : (
                      allMessages.map((msg) => {
                        const isAgent = !msg.incoming;
                        const rich = parseRichMessage(msg.message_text);
                        const rawMessageText = String(msg.message_text || "");
                        const looksLikeRichPayload = rawMessageText.trimStart().includes(RICH_MSG_PREFIX);
                        const messageText = rich?.text || (looksLikeRichPayload ? "[mensaje enriquecido]" : rawMessageText);
                        const mediaUrl = rich?.media_url || msg.media_url || null;
                        const templateName = rich?.kind === "template" ? rich?.template_name : null;
                        const templateLang = rich?.kind === "template" ? rich?.language : null;
                        const templateComponents = Array.isArray(rich?.template_components)
                          ? rich?.template_components
                          : (Array.isArray(rich?.components) ? rich?.components : []);
                        const sentComponents = Array.isArray(rich?.sent_components) ? rich?.sent_components : [];
                        const sentBodyParams = extractSentBodyParams(sentComponents);
                        const templateBodyComponent = templateComponents.find((c) => String((c as { type?: string }).type || "").toUpperCase() === "BODY") as { text?: string } | undefined;
                        const resolvedBodyText = interpolateTemplateBody(String(templateBodyComponent?.text || ""), sentBodyParams);
                        return (
                          <div
                            key={msg.id}
                            className={`flex items-end gap-2 ${isAgent ? "justify-end" : "justify-start"}`}
                          >
                            {!isAgent && (
                              <div className="bg-slate-200 size-6 rounded-full flex items-center justify-center shrink-0 mb-0.5">
                                <User className="size-3.5 text-slate-500" />
                              </div>
                            )}
                            <div className={`max-w-[85%] xl:max-w-[76%] rounded-2xl px-4 py-2.5 shadow-sm ${
                              isAgent
                                ? "bg-blue-600 text-white rounded-br-sm"
                                : "bg-white text-slate-900 rounded-bl-sm border border-slate-100"
                            }`}>
                              {!isAgent && (
                                <p className="text-[10px] font-semibold mb-1 text-slate-400 uppercase tracking-wide">Cliente</p>
                              )}
                              {isAgent && (
                                <p className="text-[10px] font-semibold mb-1 text-blue-200 uppercase tracking-wide flex items-center gap-1">
                                  <Bot className="size-3" /> Agente
                                </p>
                              )}
                              {rich?.kind === "template" ? (
                                <div className="space-y-2">
                                  <div className={`text-[10px] uppercase tracking-wide ${isAgent ? "text-blue-200" : "text-slate-500"}`}>
                                    Plantilla{templateName ? ` · ${templateName}` : ""}{templateLang ? ` · ${templateLang}` : ""}
                                  </div>
                                  {templateComponents.map((c, idx) => {
                                    const type = String((c as { type?: string }).type || "").toUpperCase();
                                    if (type === "HEADER") {
                                      const format = String((c as { format?: string }).format || "").toUpperCase();
                                      const text = String((c as { text?: string }).text || "");
                                      return (
                                        <div key={`tpl-h-${idx}`} className={`rounded-lg border px-3 py-2 text-sm ${isAgent ? "border-blue-400/40 bg-blue-500/20" : "border-slate-200 bg-white"}`}>
                                          <p className="text-[10px] uppercase opacity-70 mb-1">Header {format || "TEXT"}</p>
                                          {format === "TEXT" ? <p className="whitespace-pre-wrap">{text || "(sin texto)"}</p> : <p>Contenido multimedia ({format || "MEDIA"})</p>}
                                        </div>
                                      );
                                    }
                                    if (type === "BODY") {
                                      const text = String((c as { text?: string }).text || "");
                                      return (
                                        <div key={`tpl-b-${idx}`} className={`rounded-lg border px-3 py-2 text-sm ${isAgent ? "border-blue-400/40 bg-blue-500/30" : "border-slate-200 bg-slate-50"}`}>
                                          <p className="whitespace-pre-wrap leading-relaxed">
                                            {interpolateTemplateBody(text, sentBodyParams) || messageText || "[Template enviado]"}
                                          </p>
                                        </div>
                                      );
                                    }
                                    if (type === "FOOTER") {
                                      const text = String((c as { text?: string }).text || "");
                                      return (
                                        <div key={`tpl-f-${idx}`} className={`text-xs ${isAgent ? "text-blue-100" : "text-slate-500"}`}>
                                          {text}
                                        </div>
                                      );
                                    }
                                    if (type === "BUTTONS") {
                                      const buttons = Array.isArray((c as { buttons?: Array<{ type?: string; text?: string }> }).buttons)
                                        ? ((c as { buttons: Array<{ type?: string; text?: string }> }).buttons)
                                        : [];
                                      return (
                                        <div key={`tpl-btn-${idx}`} className="flex flex-wrap gap-2">
                                          {buttons.map((b, bIdx) => (
                                            <span
                                              key={`btn-${idx}-${bIdx}`}
                                              className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${
                                                isAgent ? "border-blue-300/50 text-blue-100" : "border-slate-300 text-slate-700"
                                              }`}
                                            >
                                              {b.text || "Botón"} <span className="ml-1 opacity-70">({String(b.type || "").toUpperCase()})</span>
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                                  {templateComponents.length === 0 ? (
                                    <div className={`rounded-lg border px-3 py-2 text-sm ${isAgent ? "border-blue-400/40 bg-blue-500/30" : "border-slate-200 bg-slate-50"}`}>
                                      <p className="whitespace-pre-wrap leading-relaxed">
                                        {resolvedBodyText || (sentBodyParams.length > 0 ? sentBodyParams.join(" | ") : (messageText || "[Template enviado]"))}
                                      </p>
                                    </div>
                                  ) : null}
                                  {sentComponents.length > 0 ? (
                                    <div className={`rounded-lg border px-3 py-2 text-xs ${isAgent ? "border-blue-400/40 bg-blue-500/20 text-blue-100" : "border-slate-200 bg-white text-slate-600"}`}>
                                      <p className="mb-1 font-medium">Parámetros enviados</p>
                                      {sentBodyParams.length > 0 ? (
                                        sentBodyParams.map((value, idx) => (
                                          <p key={`sent-p-${idx}`} className="truncate">• {value}</p>
                                        ))
                                      ) : (
                                        <p className="truncate">• (sin parámetros posicionales)</p>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : rich?.kind === "image" ? (
                                <div className="space-y-2">
                                  <ProtectedMedia mediaId={rich?.media_id} fallbackUrl={mediaUrl} mimeType={rich?.mime_type} kind="image" isAgent={isAgent} />
                                  {messageText ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{messageText}</p> : null}
                                </div>
                              ) : rich?.kind === "audio" ? (
                                <div className="space-y-2">
                                  <ProtectedMedia mediaId={rich?.media_id} fallbackUrl={mediaUrl} mimeType={rich?.mime_type} kind="audio" isAgent={isAgent} />
                                  {messageText ? <p className="text-xs opacity-80">{messageText}</p> : null}
                                </div>
                              ) : rich?.kind === "video" ? (
                                <div className="space-y-2">
                                  <ProtectedMedia mediaId={rich?.media_id} fallbackUrl={mediaUrl} mimeType={rich?.mime_type} kind="video" isAgent={isAgent} />
                                  {messageText ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{messageText}</p> : null}
                                </div>
                              ) : rich?.kind === "document" ? (
                                <div className="space-y-2">
                                  <div className={`rounded-lg border px-3 py-2 text-sm ${isAgent ? "border-blue-300/40 bg-blue-500/20 text-blue-50" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                                    Documento{rich?.filename ? `: ${rich.filename}` : ""}
                                  </div>
                                  <ProtectedMedia mediaId={rich?.media_id} fallbackUrl={mediaUrl} mimeType={rich?.mime_type} kind="document" isAgent={isAgent} />
                                  {messageText ? <p className="text-xs opacity-80">{messageText}</p> : null}
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{messageText}</p>
                              )}
                              <div className={`flex items-center justify-end gap-1.5 mt-1.5 ${isAgent ? "text-blue-200" : "text-slate-400"}`}>
                                <span className="text-[10px]">
                                  {new Date(msg.sent_at ?? msg.created_at).toLocaleTimeString("es", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {isAgent && (
                                  <CheckCheck className={`size-3.5 ${msg.read ? "text-blue-200" : "text-blue-400"}`} />
                                )}
                              </div>
                            </div>
                            {isAgent && (
                              <div className="bg-blue-100 size-6 rounded-full flex items-center justify-center shrink-0 mb-0.5">
                                <Bot className="size-3.5 text-blue-600" />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {/* Auto-scroll anchor */}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message input */}
                  <div className="bg-white border-t border-slate-100 p-3 shrink-0">
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Respuesta
                    </p>
                    <SendComposer
                      activePhone={activePhone}
                      isWindowOpen={isWindowOpen}
                      selectedTemplateId={selectedTemplateId}
                      setSelectedTemplateId={setSelectedTemplateId}
                      templatesLoading={templatesLoading}
                      sendTemplatePending={sendTemplateMutation.isPending}
                      approvedTemplates={approvedTemplates.map((template) => ({ id: template.id, template_name: template.template_name }))}
                      onSendTemplate={handleSendTemplate}
                      message={message}
                      setMessage={setMessage}
                      onKeyDown={handleKeyDown}
                      messageInputRef={messageInputRef}
                      sendPending={sendMutation.isPending}
                      onSend={handleSend}
                    />
                    {/* Hint */}
                    <div className="flex items-center gap-1.5 mt-1.5 px-1">
                      <Clock className="size-3 text-slate-300" />
                      <p className="text-[10px] text-slate-400">
                        {selectedThread?.last_interaction
                          ? `Última interacción: ${formatRelativeTime(selectedThread.last_interaction)}`
                          : "Primera vez que contactas a este número"
                        }
                        {" · "}
                        {allMessages.length} mensaje{allMessages.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
