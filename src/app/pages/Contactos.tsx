import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Search, Plus, Pencil, Trash2, MessageSquare, Phone, Mail,
  User, X, Loader2, Users,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "../components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import {
  useContacts, useContactStats, useCreateContact, useUpdateContact, useDeleteContact,
} from "../hooks/useContacts";
import type { Contact } from "../data/supabase.types";

// ── Form state helper ──────────────────────────────────────────
type ContactForm = { name: string; phone_number: string; email: string };
const emptyForm = (): ContactForm => ({ name: "", phone_number: "", email: "" });

export default function Contactos() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  // ── Sheet state ───────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm());
  const [errors, setErrors] = useState<Partial<ContactForm>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Delete dialog state ───────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  // ── Data & mutations ──────────────────────────────────────────
  const { data: contacts = [], isLoading } = useContacts();
  const { data: stats } = useContactStats();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  // Focus name field when sheet opens
  useEffect(() => {
    if (sheetOpen) setTimeout(() => nameRef.current?.focus(), 50);
  }, [sheetOpen]);

  // ── Filtering ─────────────────────────────────────────────────
  const filtered = contacts.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone_number ?? "").toLowerCase().includes(q)
    );
  });

  // ── Sheet handlers ────────────────────────────────────────────
  const openCreate = () => {
    setEditingContact(null);
    setForm(emptyForm());
    setErrors({});
    setSheetOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditingContact(c);
    setForm({
      name: c.name,
      phone_number: c.phone_number ?? "",
      email: c.email ?? "",
    });
    setErrors({});
    setSheetOpen(true);
  };

  const validateForm = (): boolean => {
    const errs: Partial<ContactForm> = {};
    if (!form.name.trim()) errs.name = "El nombre es requerido";
    if (form.phone_number && !/^\d{6,15}$/.test(form.phone_number.replace(/\s+/g, ""))) {
      errs.phone_number = "Ingresa solo dígitos (6–15 caracteres)";
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "Email inválido";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    const payload = {
      name: form.name.trim(),
      phone_number: form.phone_number.trim() || undefined,
      email: form.email.trim() || undefined,
    };

    if (editingContact) {
      updateContact.mutate(
        { id: editingContact.id, payload },
        {
          onSuccess: () => {
            toast.success("Contacto actualizado");
            setSheetOpen(false);
          },
          onError: (err) => toast.error(`Error: ${err.message}`),
        }
      );
    } else {
      createContact.mutate(payload, {
        onSuccess: () => {
          toast.success("Contacto creado correctamente");
          setSheetOpen(false);
        },
        onError: (err) => toast.error(`Error: ${err.message}`),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteContact.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`"${deleteTarget.name}" eliminado`);
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(`Error: ${err.message}`),
    });
  };

  // Navigate to Bandeja with the contact preselected
  const handleSendMessage = (c: Contact) => {
    if (!c.phone_number) {
      toast.warning("Este contacto no tiene número de WhatsApp. Agrégalo primero.");
      return;
    }
    navigate("/bandeja", { state: { contact: c } });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
  };

  const isSaving = createContact.isPending || updateContact.isPending;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-900 tracking-tight">Contactos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Gestión de clientes y números de WhatsApp
          </p>
        </div>
        <Button id="contactos-new-btn" onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="size-4" /> Nuevo Contacto
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Contactos", value: stats?.total ?? contacts.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Activos (7 días)", value: stats?.activeLastWeek ?? 0, icon: Phone, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Interacciones 24h", value: stats?.activeLast24h ?? 0, icon: MessageSquare, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-slate-100">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`${bg} p-2.5 rounded-lg`}>
                <Icon className={`size-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                {isLoading ? (
                  <Skeleton className="h-6 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Table */}
      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">Lista de Contactos</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
              <Input
                id="contactos-search"
                placeholder="Buscar por nombre, teléfono o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-slate-50 border-slate-200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <div className="bg-slate-100 p-4 rounded-full">
                <Users className="size-8 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-medium text-slate-600">
                  {searchTerm ? "Sin resultados" : "Sin contactos aún"}
                </p>
                <p className="text-sm mt-1">
                  {searchTerm ? "Prueba con otro término" : 'Usa el botón "Nuevo Contacto" para empezar'}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono WhatsApp</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Última Interacción</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50/60 transition-colors">

                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="bg-blue-100 size-8 rounded-full flex items-center justify-center shrink-0">
                          <User className="size-4 text-blue-600" />
                        </div>
                        <span className="font-medium text-slate-900">{c.name}</span>
                      </div>
                    </TableCell>

                    {/* Phone */}
                    <TableCell>
                      {c.phone_number ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5 text-emerald-500" />
                          <span className="text-slate-700 text-sm font-mono">{c.phone_number}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                          Sin número
                        </Badge>
                      )}
                    </TableCell>

                    {/* Email */}
                    <TableCell>
                      {c.email ? (
                        <div className="flex items-center gap-1.5">
                          <Mail className="size-3.5 text-slate-400" />
                          <span className="text-slate-600 text-sm">{c.email}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Last interaction */}
                    <TableCell className="text-slate-500 text-sm">
                      {formatDate(c.last_interaction)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          id={`contact-msg-${c.id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendMessage(c)}
                          className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2.5"
                          title="Enviar mensaje por WhatsApp"
                        >
                          <MessageSquare className="size-3.5" />
                          <span className="text-xs">Mensaje</span>
                        </Button>
                        <Button
                          id={`contact-edit-${c.id}`}
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(c)}
                          className="size-8 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          title="Editar contacto"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          id={`contact-delete-${c.id}`}
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(c)}
                          className="size-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Eliminar contacto"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── CREATE / EDIT SHEET ─────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader className="pb-4 border-b border-slate-100">
            <SheetTitle className="flex items-center gap-2">
              <div className="bg-blue-100 p-1.5 rounded-lg">
                <User className="size-4 text-blue-600" />
              </div>
              {editingContact ? "Editar Contacto" : "Nuevo Contacto"}
            </SheetTitle>
            <SheetDescription>
              {editingContact
                ? "Mantén actualizado el número para poder enviar mensajes de WhatsApp."
                : "Agrega el número de WhatsApp del cliente para poder contactarlo desde la Bandeja."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-5 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="cf-name" className="text-sm font-medium text-slate-700">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cf-name"
                ref={nameRef}
                placeholder="Ej: María González"
                value={form.name}
                onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: undefined })); }}
                className={errors.name ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="cf-phone" className="text-sm font-medium text-slate-700">
                Teléfono WhatsApp
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
                <Input
                  id="cf-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="Ej: 59171234567 (con código de país)"
                  value={form.phone_number}
                  onChange={(e) => { setForm(f => ({ ...f, phone_number: e.target.value })); setErrors(er => ({ ...er, phone_number: undefined })); }}
                  className={`pl-9 font-mono ${errors.phone_number ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
              </div>
              {errors.phone_number ? (
                <p className="text-xs text-red-500">{errors.phone_number}</p>
              ) : (
                <p className="text-xs text-slate-400">Incluye el código de país sin el + (ej: 591 para Bolivia)</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="cf-email" className="text-sm font-medium text-slate-700">
                Email (opcional)
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
                <Input
                  id="cf-email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={(e) => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: undefined })); }}
                  className={`pl-9 ${errors.email ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          </div>

          <SheetFooter className="pt-4 border-t border-slate-100 gap-2">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={isSaving}
              className="flex-1"
            >
              <X className="size-3.5 mr-1.5" /> Cancelar
            </Button>
            <Button
              id="cf-submit"
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : editingContact ? (
                <Pencil className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {isSaving ? "Guardando..." : editingContact ? "Actualizar" : "Crear Contacto"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── DELETE CONFIRMATION ──────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-red-500" />
              Eliminar contacto
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar a{" "}
              <span className="font-semibold text-slate-900">"{deleteTarget?.name}"</span>?
              {" "}El historial de conversaciones se conservará, pero no podrás enviarle nuevos mensajes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteContact.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteContact.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="size-3.5 mr-1.5" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
