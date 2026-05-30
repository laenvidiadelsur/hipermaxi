import { useState } from "react";
import { Search, Download, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import * as XLSX from "xlsx";

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  data: Record<string, any>[];
  onExport?: () => void;
}

export function DetailModal({
  open,
  onOpenChange,
  title,
  description,
  data,
  onExport,
}: DetailModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const filteredData = data.filter((row) => {
    const searchLower = searchTerm.toLowerCase();
    return Object.values(row).some((value) =>
      String(value).toLowerCase().includes(searchLower)
    );
  });

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      const ws = XLSX.utils.json_to_sheet(filteredData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Detalle");
      XLSX.writeFile(wb, `Detalle_${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Search and Export */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Buscar en los datos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4 mr-2" />
            Exportar
          </Button>
        </div>

        {/* Results Count */}
        <div className="text-sm text-slate-600">
          Mostrando {filteredData.length} de {data.length} registros
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          {filteredData.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No se encontraron resultados
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b sticky top-0">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-medium text-slate-700"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3 text-slate-600">
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}