import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Settings, Eye, EyeOff, Check, RefreshCw, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useWhatsappConfig,
  useSaveWhatsappConfig,
  useTemplates,
  useSyncMetaTemplates,
  useCreateMetaTemplate,
  useValidateMetaTemplate,
} from "../hooks/useWhatsapp";
import { useNotificationPreferences, useSaveNotificationPreferences } from "../hooks/useNotifications";

type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
type TemplateType = "STANDARD" | "CAROUSEL" | "FLOW";
type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "FLOW";
const DEFAULT_NOTIFICATION_EVENTS = [
  { event_type: "mass_send_failed", label: "Fallo de envío masivo" },
  { event_type: "thread_inbound_message", label: "Nuevo mensaje en bandeja" },
  { event_type: "debt_overdue_threshold", label: "Umbral de mora vencida" },
];

type WizardButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  | { type: "FLOW"; text: string; flow_id: string };

type CarouselCardDraft = {
  header_media_url?: string;
  body_text: string;
  buttons: WizardButton[];
};

function normalizeTemplateName(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractPlaceholders(text: string) {
  const matches = text.match(/\{\{\d+\}\}/g) ?? [];
  return [...new Set(matches)];
}

function validateConsecutivePlaceholders(placeholders: string[]) {
  if (placeholders.length === 0) return { ok: true, message: "Sin variables dinámicas" };
  const nums = placeholders
    .map((ph) => Number(ph.replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const expected = Array.from({ length: nums.length }, (_, i) => i + 1);
  const ok = nums.length === expected.length && nums.every((n, i) => n === expected[i]);
  return {
    ok,
    message: ok
      ? `Variables válidas: ${placeholders.join(", ")}`
      : "Variables inválidas. Deben ser consecutivas: {{1}}, {{2}}, {{3}}...",
  };
}

function WhatsAppPreview(props: { components: Array<Record<string, unknown>> }) {
  const header = props.components.find((c) => String((c as any).type).toUpperCase() === "HEADER") as any;
  const body = props.components.find((c) => String((c as any).type).toUpperCase() === "BODY") as any;
  const footer = props.components.find((c) => String((c as any).type).toUpperCase() === "FOOTER") as any;
  const buttons = props.components.find((c) => String((c as any).type).toUpperCase() === "BUTTONS") as any;

  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="mx-auto max-w-sm rounded-2xl bg-white shadow-sm border overflow-hidden">
        <div className="bg-emerald-600 text-white px-4 py-3 text-sm font-medium">WhatsApp</div>
        <div className="p-4">
          <div className="ml-auto max-w-[85%] rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
            {header?.format === "TEXT" && header?.text ? (
              <div className="font-semibold text-slate-900 mb-1">{header.text}</div>
            ) : header?.format && header?.format !== "TEXT" ? (
              <div className="mb-2 rounded-lg border bg-slate-100 p-3 text-xs text-slate-600">
                Header {String(header.format).toUpperCase()} (ejemplo)
              </div>
            ) : null}

            {body?.text ? <div className="text-sm text-slate-900 whitespace-pre-wrap">{body.text}</div> : null}
            {footer?.text ? <div className="mt-2 text-xs text-slate-500 whitespace-pre-wrap">{footer.text}</div> : null}
          </div>

          {Array.isArray(buttons?.buttons) && buttons.buttons.length > 0 ? (
            <div className="mt-3 ml-auto max-w-[85%] space-y-2">
              {buttons.buttons.map((b: any, idx: number) => (
                <button
                  key={idx}
                  type="button"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 text-left"
                >
                  {b.text || "Botón"}
                  <span className="ml-2 text-xs text-slate-500">({String(b.type || "").toUpperCase()})</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildStandardComponents(draft: {
  headerFormat: HeaderFormat;
  headerText: string;
  headerMediaUrl: string;
  bodyText: string;
  footerText: string;
  buttons: WizardButton[];
}) {
  const components: Array<Record<string, unknown>> = [];

  if (draft.headerFormat !== "NONE") {
    if (draft.headerFormat === "TEXT") {
      if (draft.headerText.trim()) components.push({ type: "HEADER", format: "TEXT", text: draft.headerText.trim() });
    } else {
      const exampleUrl = draft.headerMediaUrl.trim();
      const header: Record<string, unknown> = { type: "HEADER", format: draft.headerFormat };
      if (exampleUrl) (header as any).example = { header_handle: [exampleUrl] };
      components.push(header);
    }
  }

  components.push({ type: "BODY", text: draft.bodyText.trim() });
  if (draft.footerText.trim()) components.push({ type: "FOOTER", text: draft.footerText.trim() });

  if (draft.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) => {
        if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text.trim() };
        if (b.type === "URL") return { type: "URL", text: b.text.trim(), url: (b as any).url?.trim?.() ?? "" };
        if (b.type === "PHONE_NUMBER")
          return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: (b as any).phone_number?.trim?.() ?? "" };
        return { type: "FLOW", text: b.text.trim(), flow_id: (b as any).flow_id?.trim?.() ?? "" };
      }),
    });
  }

  return components;
}

function buildFlowComponents(draft: { bodyText: string; flowButton: { text: string; flow_id: string } }) {
  return [
    { type: "BODY", text: draft.bodyText.trim() },
    { type: "BUTTONS", buttons: [{ type: "FLOW", text: draft.flowButton.text.trim(), flow_id: draft.flowButton.flow_id.trim() }] },
  ];
}

function buildCarouselComponents(draft: { bubbleText: string; headerMediaFormat: "IMAGE" | "VIDEO"; cards: CarouselCardDraft[] }) {
  const cards = draft.cards.map((c) => {
    const cardComponents: Array<Record<string, unknown>> = [];
    const url = (c.header_media_url || "").trim();
    const header: Record<string, unknown> = { type: "HEADER", format: draft.headerMediaFormat };
    if (url) (header as any).example = { header_handle: [url] };
    cardComponents.push(header);
    cardComponents.push({ type: "BODY", text: c.body_text.trim() });
    if (c.buttons.length > 0) {
      cardComponents.push({
        type: "BUTTONS",
        buttons: c.buttons
          .filter((b) => b.type !== "FLOW")
          .map((b) => {
            if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text.trim() };
            if (b.type === "URL") return { type: "URL", text: b.text.trim(), url: (b as any).url?.trim?.() ?? "" };
            return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: (b as any).phone_number?.trim?.() ?? "" };
          }),
      });
    }
    return { components: cardComponents };
  });

  return [{ type: "BODY", text: draft.bubbleText.trim() }, { type: "CAROUSEL", cards }];
}

function TemplateCreateWizard(props: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateMetaTemplate();
  const validate = useValidateMetaTemplate();

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [templateType, setTemplateType] = useState<TemplateType>("STANDARD");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_LA");

  // STANDARD
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<WizardButton[]>([]);

  // FLOW
  const [flowBody, setFlowBody] = useState("");
  const [flowButtonText, setFlowButtonText] = useState("Abrir formulario");
  const [flowId, setFlowId] = useState("");

  // CAROUSEL
  const [carouselBubble, setCarouselBubble] = useState("");
  const [carouselHeaderMediaFormat, setCarouselHeaderMediaFormat] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [cards, setCards] = useState<CarouselCardDraft[]>([{ body_text: "", buttons: [] }]);

  const placeholders = useMemo(() => {
    if (templateType === "STANDARD") return extractPlaceholders(bodyText);
    if (templateType === "FLOW") return extractPlaceholders(flowBody);
    const all = [carouselBubble, ...cards.map((c) => c.body_text)].join("\n");
    return extractPlaceholders(all);
  }, [templateType, bodyText, flowBody, carouselBubble, cards]);

  const placeholderValidation = useMemo(() => validateConsecutivePlaceholders(placeholders), [placeholders]);

  const computedComponents = useMemo(() => {
    if (templateType === "STANDARD") {
      return buildStandardComponents({ headerFormat, headerText, headerMediaUrl, bodyText, footerText, buttons });
    }
    if (templateType === "FLOW") {
      return buildFlowComponents({ bodyText: flowBody, flowButton: { text: flowButtonText, flow_id: flowId } });
    }
    return buildCarouselComponents({ bubbleText: carouselBubble, headerMediaFormat: carouselHeaderMediaFormat, cards });
  }, [
    templateType,
    headerFormat,
    headerText,
    headerMediaUrl,
    bodyText,
    footerText,
    buttons,
    flowBody,
    flowButtonText,
    flowId,
    carouselBubble,
    carouselHeaderMediaFormat,
    cards,
  ]);

  const canGoNext = () => {
    if (step === 1) return true;
    if (step === 2) {
      const n = normalizeTemplateName(name);
      if (!n) return false;
      if (!/^[a-z0-9_]{1,512}$/.test(n)) return false;
      if (!language.trim()) return false;
      return true;
    }
    if (step === 3) {
      if (!placeholderValidation.ok) return false;
      if (templateType === "STANDARD") return bodyText.trim().length > 0;
      if (templateType === "FLOW") return flowBody.trim().length > 0 && flowId.trim().length > 0 && flowButtonText.trim().length > 0;
      return carouselBubble.trim().length > 0 && cards.every((c) => c.body_text.trim().length > 0);
    }
    return true;
  };

  const addButton = (type: ButtonType) => {
    if (type === "QUICK_REPLY") setButtons((b) => [...b, { type: "QUICK_REPLY", text: "Responder" }]);
    if (type === "URL") setButtons((b) => [...b, { type: "URL", text: "Visitar sitio", url: "https://example.com" }]);
    if (type === "PHONE_NUMBER") setButtons((b) => [...b, { type: "PHONE_NUMBER", text: "Llamar", phone_number: "+56900000000" }]);
    if (type === "FLOW") setButtons((b) => [...b, { type: "FLOW", text: "Abrir flow", flow_id: "" }]);
  };

  const submit = async () => {
    if (!placeholderValidation.ok) {
      toast.error(placeholderValidation.message);
      return;
    }

    const normalizedName = normalizeTemplateName(name);
    if (!normalizedName) {
      toast.error("Nombre inválido");
      return;
    }

    try {
      await validate.mutateAsync({
        name: normalizedName,
        language: language.trim(),
        category,
        template_type: templateType,
        components: computedComponents,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error validando plantilla");
      return;
    }

    create.mutate(
      {
        name: normalizedName,
        language: language.trim(),
        category,
        template_type: templateType,
        components: computedComponents,
        args: placeholders,
      },
      {
        onSuccess: () => {
          toast.success("Plantilla enviada a revisión en Meta");
          props.onOpenChange(false);
        },
        onError: (err) => toast.error(`Error creando plantilla: ${(err as Error).message}`),
      }
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Crear plantilla (Meta)</DialogTitle>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge className={step === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>1) Categoría</Badge>
            <Badge className={step === 2 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>2) Config</Badge>
            <Badge className={step === 3 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>3) Contenido</Badge>
            <Badge className={step === 4 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>4) Preview</Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="pb-6 space-y-5">
            {step === 1 ? (
              <>
                <p className="text-sm text-slate-600">Elige categoría y tipo de plantilla.</p>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Tabs value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                    <TabsList>
                      <TabsTrigger value="MARKETING">Marketing</TabsTrigger>
                      <TabsTrigger value="UTILITY">Utilidad</TabsTrigger>
                      <TabsTrigger value="AUTHENTICATION">Autenticación</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(
                      [
                        { id: "STANDARD", title: "Personalizado", desc: "Texto/Media + botones" },
                        { id: "CAROUSEL", title: "Carrusel", desc: "Cards con media + CTA" },
                        { id: "FLOW", title: "Flows", desc: "Botón que abre un Flow" },
                      ] as Array<{ id: TemplateType; title: string; desc: string }>
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplateType(t.id)}
                        className={`text-left rounded-xl border p-4 hover:bg-slate-50 ${
                          templateType === t.id ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-slate-900">{t.title}</div>
                          {templateType === t.id ? <Badge className="bg-emerald-100 text-emerald-800">Seleccionado</Badge> : null}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <p className="text-sm text-slate-600">
                  El nombre debe ser <span className="font-medium">snake_case</span>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre de plantilla</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="recordatorio_pago_1" />
                    <div className="text-xs text-slate-500">
                      Normalizado: <span className="font-mono">{normalizeTemplateName(name) || "—"}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="es_LA" />
                  </div>
                </div>
              </>
            ) : step === 3 ? (
              templateType === "STANDARD" ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Header</Label>
                      <Select value={headerFormat} onValueChange={(v) => setHeaderFormat(v as HeaderFormat)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sin header</SelectItem>
                          <SelectItem value="TEXT">Texto</SelectItem>
                          <SelectItem value="IMAGE">Imagen</SelectItem>
                          <SelectItem value="VIDEO">Video</SelectItem>
                          <SelectItem value="DOCUMENT">Documento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {headerFormat === "TEXT" ? (
                      <div className="space-y-2">
                        <Label>Header texto</Label>
                        <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Recordatorio de pago" />
                      </div>
                    ) : headerFormat !== "NONE" ? (
                      <div className="space-y-2">
                        <Label>URL ejemplo (opcional)</Label>
                        <Input value={headerMediaUrl} onChange={(e) => setHeaderMediaUrl(e.target.value)} placeholder="https://.../header.jpg" />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Body</Label>
                    <Textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      placeholder="Hola {{1}}, tu deuda de {{2}} vence el {{3}}."
                      className="min-h-28"
                    />
                    <div className={`text-xs ${placeholderValidation.ok ? "text-emerald-700" : "text-red-700"}`}>{placeholderValidation.message}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>Footer (opcional)</Label>
                    <Textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Ribentek AI Cobranzas" />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">Botones</div>
                        <div className="text-xs text-slate-500">Quick replies, URL o llamada.</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => addButton("QUICK_REPLY")}>
                          + Quick reply
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => addButton("URL")}>
                          + URL
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => addButton("PHONE_NUMBER")}>
                          + Llamada
                        </Button>
                      </div>
                    </div>

                    {buttons.length === 0 ? (
                      <div className="text-sm text-slate-500">Sin botones.</div>
                    ) : (
                      <div className="space-y-3">
                        {buttons.map((b, idx) => (
                          <div key={idx} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Badge className="bg-slate-100 text-slate-800">{b.type}</Badge>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setButtons((arr) => arr.filter((_, i) => i !== idx))}>
                                Quitar
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1 md:col-span-1">
                                <Label className="text-xs">Texto</Label>
                                <Input
                                  value={b.text}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setButtons((arr) => arr.map((x, i) => (i === idx ? ({ ...x, text: v } as any) : x)));
                                  }}
                                />
                              </div>
                              {b.type === "URL" ? (
                                <div className="space-y-1 md:col-span-2">
                                  <Label className="text-xs">URL</Label>
                                  <Input
                                    value={(b as any).url}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setButtons((arr) => arr.map((x, i) => (i === idx ? ({ ...x, url: v } as any) : x)));
                                    }}
                                  />
                                </div>
                              ) : b.type === "PHONE_NUMBER" ? (
                                <div className="space-y-1 md:col-span-2">
                                  <Label className="text-xs">Teléfono</Label>
                                  <Input
                                    value={(b as any).phone_number}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setButtons((arr) => arr.map((x, i) => (i === idx ? ({ ...x, phone_number: v } as any) : x)));
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : templateType === "FLOW" ? (
                <>
                  <div className="space-y-2">
                    <Label>Body</Label>
                    <Textarea value={flowBody} onChange={(e) => setFlowBody(e.target.value)} placeholder="Hola {{1}}, completa este formulario." className="min-h-28" />
                    <div className={`text-xs ${placeholderValidation.ok ? "text-emerald-700" : "text-red-700"}`}>{placeholderValidation.message}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Texto del botón</Label>
                      <Input value={flowButtonText} onChange={(e) => setFlowButtonText(e.target.value)} placeholder="Abrir formulario" />
                    </div>
                    <div className="space-y-2">
                      <Label>Flow ID</Label>
                      <Input value={flowId} onChange={(e) => setFlowId(e.target.value)} placeholder="123456789012345" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Mensaje (bubble) del carrusel</Label>
                    <Textarea value={carouselBubble} onChange={(e) => setCarouselBubble(e.target.value)} placeholder="Elige una opción:" className="min-h-24" />
                    <div className={`text-xs ${placeholderValidation.ok ? "text-emerald-700" : "text-red-700"}`}>{placeholderValidation.message}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>Formato media en cards</Label>
                    <Select value={carouselHeaderMediaFormat} onValueChange={(v) => setCarouselHeaderMediaFormat(v as "IMAGE" | "VIDEO")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IMAGE">Imagen</SelectItem>
                        <SelectItem value="VIDEO">Video</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">Cards</div>
                      <div className="text-xs text-slate-500">1 a 10 cards (Meta validará límites exactos).</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCards((arr) => (arr.length >= 10 ? arr : [...arr, { body_text: "", buttons: [] }]))}>
                      + Card
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {cards.map((c, idx) => (
                      <div key={idx} className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-slate-900">Card {idx + 1}</div>
                          <Button type="button" size="sm" variant="ghost" disabled={cards.length === 1} onClick={() => setCards((arr) => arr.filter((_, i) => i !== idx))}>
                            Quitar
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label>URL ejemplo (opcional)</Label>
                          <Input value={c.header_media_url || ""} onChange={(e) => setCards((arr) => arr.map((x, i) => (i === idx ? { ...x, header_media_url: e.target.value } : x)))} placeholder="https://.../card.jpg" />
                        </div>

                        <div className="space-y-2">
                          <Label>Body</Label>
                          <Textarea value={c.body_text} onChange={(e) => setCards((arr) => arr.map((x, i) => (i === idx ? { ...x, body_text: e.target.value } : x)))} placeholder="Opción {{1}} ..." className="min-h-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="font-medium text-slate-900">Vista previa</div>
                    {templateType === "CAROUSEL" ? (
                      <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-900 mb-2">Carrusel</div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs text-slate-500 mb-1">Bubble</div>
                          <div className="whitespace-pre-wrap">{carouselBubble || "—"}</div>
                        </div>
                      </div>
                    ) : (
                      <WhatsAppPreview components={computedComponents} />
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="font-medium text-slate-900">Payload (Meta)</div>
                    <div className="rounded-xl border bg-slate-950 text-slate-50 p-4 text-xs overflow-auto">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(
                          {
                            name: normalizeTemplateName(name),
                            language,
                            category,
                            template_type: templateType,
                            components: computedComponents,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-white px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">{step < 4 ? "Completa el paso para continuar." : "Listo para enviar a revisión."}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => (step === 1 ? props.onOpenChange(false) : setStep((s) => Math.max(1, s - 1)))}>
              {step === 1 ? "Cerrar" : "Atrás"}
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canGoNext()}>
                Siguiente
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={create.isPending || validate.isPending}>
                {create.isPending ? "Enviando..." : "Enviar para revisión"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Configuracion() {
  const { data: config, isLoading } = useWhatsappConfig();
  const { data: templates = [], isLoading: isTemplatesLoading } = useTemplates();
  const saveConfig = useSaveWhatsappConfig();
  const syncTemplates = useSyncMetaTemplates();
  const { data: notificationPreferences = [], isLoading: preferencesLoading } = useNotificationPreferences();
  const savePreferences = useSaveNotificationPreferences();

  const getInitial = (key: string) => sessionStorage.getItem(`config_draft_${key}`) ?? "";
  const [metaId, setMetaId] = useState(getInitial("metaId"));
  const [channelName, setChannelName] = useState(getInitial("channelName"));
  const [wabaId, setWabaId] = useState(getInitial("wabaId"));
  const [phoneNumberId, setPhoneNumberId] = useState(getInitial("phoneNumberId"));
  const [verifyToken, setVerifyToken] = useState(getInitial("verifyToken"));
  const [defaultTemplateLanguage, setDefaultTemplateLanguage] = useState(getInitial("defaultTemplateLanguage") || "es_LA");
  const [accessToken, setAccessToken] = useState(getInitial("accessToken"));
  const [showToken, setShowToken] = useState(false);

  const [isInitialized, setIsInitialized] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "APPROVED" | "PENDING" | "REJECTED">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategory>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TemplateType>("all");

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      const name = String(t.template_name || "").toLowerCase();
      const status = String(t.meta_status || "").toUpperCase();
      const category = String(t.category || "").toUpperCase();
      const type = String((t as unknown as { template_type?: string }).template_type || "STANDARD").toUpperCase();
      if (q && !name.includes(q)) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (typeFilter !== "all" && type !== typeFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter, typeFilter]);

  // Initialize form once when config is successfully loaded
  useEffect(() => {
    if (config && !isInitialized) {
      if (!sessionStorage.getItem("config_draft_metaId")) setMetaId(config.meta_id);
      if (!sessionStorage.getItem("config_draft_channelName")) setChannelName(config.channel_name ?? "");
      if (!sessionStorage.getItem("config_draft_wabaId")) setWabaId(config.waba_id);
      if (!sessionStorage.getItem("config_draft_phoneNumberId")) setPhoneNumberId(config.phone_number_id ?? "");
      if (!sessionStorage.getItem("config_draft_verifyToken")) setVerifyToken(config.verify_token ?? "");
      if (!sessionStorage.getItem("config_draft_defaultTemplateLanguage")) setDefaultTemplateLanguage(config.default_template_language ?? "es_LA");
      if (!sessionStorage.getItem("config_draft_accessToken")) setAccessToken(config.token);
      setIsInitialized(true);
    }
  }, [config, isInitialized]);

  // Sync to session storage on change
  useEffect(() => { sessionStorage.setItem("config_draft_metaId", metaId); }, [metaId]);
  useEffect(() => { sessionStorage.setItem("config_draft_channelName", channelName); }, [channelName]);
  useEffect(() => { sessionStorage.setItem("config_draft_wabaId", wabaId); }, [wabaId]);
  useEffect(() => { sessionStorage.setItem("config_draft_phoneNumberId", phoneNumberId); }, [phoneNumberId]);
  useEffect(() => { sessionStorage.setItem("config_draft_verifyToken", verifyToken); }, [verifyToken]);
  useEffect(() => { sessionStorage.setItem("config_draft_defaultTemplateLanguage", defaultTemplateLanguage); }, [defaultTemplateLanguage]);
  useEffect(() => { sessionStorage.setItem("config_draft_accessToken", accessToken); }, [accessToken]);
  const handleSave = () => {
    if (!metaId || !wabaId || !phoneNumberId || !verifyToken || !accessToken) {
      toast.error("Por favor completa todos los campos");
      return;
    }
    saveConfig.mutate(
      {
        channel_name: channelName || undefined,
        meta_id: metaId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        verify_token: verifyToken,
        default_template_language: defaultTemplateLanguage || "es_LA",
        token: accessToken
      },
      {
        onSuccess: () => {
          sessionStorage.removeItem("config_draft_metaId");
          sessionStorage.removeItem("config_draft_channelName");
          sessionStorage.removeItem("config_draft_wabaId");
          sessionStorage.removeItem("config_draft_phoneNumberId");
          sessionStorage.removeItem("config_draft_verifyToken");
          sessionStorage.removeItem("config_draft_defaultTemplateLanguage");
          sessionStorage.removeItem("config_draft_accessToken");
          toast.success("Configuración validada con Meta y guardada correctamente");
        },
        onError: (err) => toast.error(`Error al guardar: ${err.message}`),
      }
    );
  };

  const maskToken = (token: string) => {
    if (token.length <= 8) return token;
    return token.substring(0, 4) + "•".repeat(Math.min(token.length - 8, 20)) + token.substring(token.length - 4);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl text-slate-900">Configuración</h1>
        <p className="text-slate-600 mt-2">Gestiona la integración con WhatsApp Business</p>
      </div>
      <Tabs defaultValue="credenciales" className="max-w-5xl">
        <TabsList className="w-full max-w-xl">
          <TabsTrigger value="credenciales">Credenciales</TabsTrigger>
          <TabsTrigger value="mensajes">Gestor de Mensajes</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="credenciales" className="space-y-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-green-50 p-2 rounded-lg">
                  <Settings className="size-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>Integración WhatsApp / Meta</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Estos datos permiten conectar el número desde el cual se enviarán los recordatorios
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="channelName">Nombre del canal (opcional)</Label>
                    <Input id="channelName" placeholder="Ej: WhatsApp Cobranza Principal" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metaId">Facebook App ID</Label>
                    <Input id="metaId" placeholder="Ej: 123456789012345" value={metaId} onChange={(e) => setMetaId(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
                    <Input id="wabaId" placeholder="Ej: 987654321098765" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                    <Input id="phoneNumberId" placeholder="Ej: 123456789012345" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="verifyToken">Webhook Verify Token</Label>
                    <Input id="verifyToken" placeholder="Token definido al suscribir el webhook en Meta" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultTemplateLanguage">Idioma por defecto de plantillas</Label>
                    <Input id="defaultTemplateLanguage" placeholder="es_LA" value={defaultTemplateLanguage} onChange={(e) => setDefaultTemplateLanguage(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Token de Acceso</Label>
                    <div className="relative">
                      <Input
                        id="accessToken"
                        type={showToken ? "text" : "password"}
                        placeholder="Ej: EAAxxxxxxxxxxxxxxxx"
                        value={showToken ? accessToken : maskToken(accessToken)}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button onClick={handleSave} className="min-w-[200px]" disabled={saveConfig.isPending}>
                      {saveConfig.isPending ? "Guardando..." : saveConfig.isSuccess ? <><Check className="size-4 mr-2" />Guardado</> : "Guardar configuración"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensajes" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Plantillas (Meta)</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Crea plantillas como en Meta Business Manager y envíalas a revisión en un paso.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    syncTemplates.mutate("pending", {
                      onSuccess: (r) => toast.success(`Sincronizadas: ${r.synced} · Importadas: ${r.imported ?? 0}`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={syncTemplates.isPending}
                >
                  <RefreshCw className="size-4 mr-2" />
                  {syncTemplates.isPending ? "Sincronizando..." : "Sincronizar"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    syncTemplates.mutate("all", {
                      onSuccess: (r) => toast.success(`Sync completo: ${r.synced} · Importadas: ${r.imported ?? 0}`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={syncTemplates.isPending}
                >
                  <RefreshCw className="size-4 mr-2" />
                  Sync todo
                </Button>
                <Button onClick={() => setWizardOpen(true)} disabled={!config}>
                  <PlusCircle className="size-4 mr-2" />
                  Nueva plantilla
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Primero configura tu integración de WhatsApp/Meta en la pestaña <span className="font-medium">Credenciales</span>.
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">Buscar</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre..." />
                </div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <select
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                  >
                    <option value="all">Todos</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="APPROVED">Aprobada</option>
                    <option value="REJECTED">Rechazada</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Categoría</Label>
                  <select
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as any)}
                  >
                    <option value="all">Todas</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as any)}
                  >
                    <option value="all">Todos</option>
                    <option value="STANDARD">STANDARD</option>
                    <option value="CAROUSEL">CAROUSEL</option>
                    <option value="FLOW">FLOW</option>
                  </select>
                </div>
              </div>

              {isTemplatesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <p className="text-sm text-slate-500">No hay plantillas registradas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {filteredTemplates.map((t) => {
                    const type = String((t as unknown as { template_type?: string }).template_type || "STANDARD").toUpperCase();
                    const headerFmt = String((t as unknown as { header_format?: string }).header_format || "NONE").toUpperCase();
                    const rejectionReason = String((t as unknown as { rejection_reason?: string }).rejection_reason || "");
                    return (
                    <div key={t.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">{t.template_name}</p>
                        <p className="text-xs text-slate-500">{t.language} · {t.category} · {type}{headerFmt !== "NONE" ? ` · HEADER:${headerFmt}` : ""}</p>
                        {String(t.meta_status).toUpperCase() === "REJECTED" && rejectionReason ? (
                          <p className="text-xs text-red-700 mt-1 line-clamp-2">Motivo: {rejectionReason}</p>
                        ) : null}
                      </div>
                      <Badge
                        className={
                          t.meta_status === "APPROVED"
                            ? "bg-green-100 text-green-800"
                            : t.meta_status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }
                      >
                        {t.meta_status}
                      </Badge>
                    </div>
                  )})}
                </div>
              )}
            </CardContent>
          </Card>

          <TemplateCreateWizard open={wizardOpen} onOpenChange={setWizardOpen} />
        </TabsContent>

        <TabsContent value="notificaciones" className="space-y-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Preferencias de notificaciones</CardTitle>
              <p className="text-sm text-slate-600">
                Define qué eventos deseas recibir en la campana en tiempo real.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {preferencesLoading ? (
                <>
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </>
              ) : (
                DEFAULT_NOTIFICATION_EVENTS.map((eventDef) => {
                  const current = notificationPreferences.find((item) => item.event_type === eventDef.event_type);
                  const checked = current ? current.enabled_in_app : true;
                  return (
                    <div key={eventDef.event_type} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{eventDef.label}</p>
                        <p className="text-xs text-slate-500">{eventDef.event_type}</p>
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={(enabled) => {
                          const others = notificationPreferences
                            .filter((item) => item.event_type !== eventDef.event_type)
                            .map((item) => ({
                              event_type: item.event_type,
                              enabled_in_app: item.enabled_in_app,
                              enabled_email: item.enabled_email,
                            }));
                          savePreferences.mutate(
                            [...others, { event_type: eventDef.event_type, enabled_in_app: enabled, enabled_email: false }],
                            {
                              onSuccess: () => toast.success("Preferencia actualizada"),
                              onError: (err) => toast.error((err as Error).message),
                            }
                          );
                        }}
                      />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
