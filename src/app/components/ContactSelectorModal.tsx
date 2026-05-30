import { useState } from "react";
import { Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

interface Contact {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
}

interface ContactSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  selectedContactIds: string[];
  onSelectedContactIdsChange: (selectedIds: string[]) => void;
}

export function ContactSelectorModal({
  open,
  onOpenChange,
  contacts,
  selectedContactIds,
  onSelectedContactIdsChange,
}: ContactSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedContactIds);

  const filteredContacts = contacts.filter((contact) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      contact.nombre.toLowerCase().includes(searchLower) ||
      contact.telefono.toLowerCase().includes(searchLower) ||
      contact.email.toLowerCase().includes(searchLower)
    );
  });

  const toggleContact = (contactId: string) => {
    setTempSelectedIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleConfirm = () => {
    onSelectedContactIdsChange(tempSelectedIds);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempSelectedIds(selectedContactIds);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Seleccionar contactos</DialogTitle>
          <DialogDescription>
            Elige los contactos que recibirán los recordatorios
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, teléfono o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Counter */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <Users className="size-4 text-blue-600" />
          <p className="text-sm text-blue-900">
            <span className="font-medium">{tempSelectedIds.length}</span> contacto
            {tempSelectedIds.length !== 1 ? "s" : ""} seleccionado
            {tempSelectedIds.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          {filteredContacts.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No se encontraron contactos
            </div>
          ) : (
            <div className="divide-y">
              {filteredContacts.map((contact) => {
                const isSelected = tempSelectedIds.includes(contact.id);
                return (
                  <div
                    key={contact.id}
                    className={`flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                    onClick={() => toggleContact(contact.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{contact.nombre}</p>
                      <div className="flex gap-3 mt-1">
                        <p className="text-sm text-slate-600">{contact.telefono}</p>
                        <p className="text-sm text-slate-600">{contact.email}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            Confirmar selección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}