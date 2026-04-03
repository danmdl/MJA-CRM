"use client";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReportField {
  key: string;
  label: string;
  checked: boolean;
}

const ALL_FIELDS: ReportField[] = [
  { key: 'numero_cuerda', label: 'Cuerda', checked: true },
  { key: 'conector', label: 'Conector', checked: true },
  { key: 'first_name', label: 'Nombre', checked: true },
  { key: 'last_name', label: 'Apellido', checked: true },
  { key: 'phone', label: 'Teléfono', checked: true },
  { key: 'address', label: 'Dirección', checked: true },
  { key: 'barrio', label: 'Barrio', checked: false },
  { key: 'apartment_number', label: 'Departamento', checked: false },
  { key: 'zona', label: 'Zona', checked: true },
  { key: 'fecha_contacto', label: 'Fecha de Contacto', checked: true },
  { key: 'date_of_birth', label: 'Fecha de Nacimiento', checked: false },
  { key: 'edad', label: 'Edad', checked: false },
  { key: 'sexo', label: 'Sexo', checked: false },
  { key: 'estado_civil', label: 'Estado Civil', checked: false },
  { key: 'estado_seguimiento', label: 'Estado de Seguimiento', checked: true },
  { key: 'observaciones', label: 'Observaciones', checked: false },
  { key: 'pedido_de_oracion', label: 'Pedido de Oración', checked: false },
  { key: 'created_at', label: 'Fecha de Creación', checked: false },
];

const ALL_CUERDAS = ['101','102','103','104','105','106','107','108','109','110','201','202','203','204','205','206','207','208','209','210','301','302'];

interface Props {
  churchId: string;
  churchName: string;
  inline?: boolean;
}

const CustomReportBuilder = ({ churchId, churchName, inline }: Props) => {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ReportField[]>(ALL_FIELDS.map(f => ({ ...f })));
  const [selectedCuerdas, setSelectedCuerdas] = useState<Set<string>>(new Set());
  const [allCuerdas, setAllCuerdas] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState<string>('all');
  const [generating, setGenerating] = useState(false);

  const toggleField = (key: string) => setFields(prev => prev.map(f => f.key === key ? { ...f, checked: !f.checked } : f));
  const selectAllFields = () => setFields(prev => prev.map(f => ({ ...f, checked: true })));
  const deselectAllFields = () => setFields(prev => prev.map(f => ({ ...f, checked: false })));

  const toggleCuerda = (n: string) => {
    setAllCuerdas(false);
    setSelectedCuerdas(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };
  const selectAllCuerdas = () => { setAllCuerdas(true); setSelectedCuerdas(new Set()); };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const selectedKeys = fields.filter(f => f.checked).map(f => f.key);
      if (selectedKeys.length === 0) { showError('Seleccioná al menos una columna.'); return; }

      let query = supabase
        .from('contacts')
        .select(selectedKeys.join(', '))
        .eq('church_id', churchId)
        .order('numero_cuerda', { ascending: true });

      if (!allCuerdas && selectedCuerdas.size > 0) {
        query = query.in('numero_cuerda', Array.from(selectedCuerdas));
      }
      if (estadoFilter !== 'all') query = query.eq('estado_seguimiento', estadoFilter);

      const { data, error } = await query;
      if (error || !data) { showError('Error al generar el reporte.'); return; }

      const headers = fields.filter(f => f.checked).map(f => f.label);
      const rows = data.map((row: any) =>
        fields.filter(f => f.checked).map(f => {
          const val = row[f.key];
          if (val === null || val === undefined) return '';
          if (['created_at', 'fecha_contacto', 'date_of_birth'].includes(f.key)) {
            try { return new Date(val).toLocaleDateString('es-AR'); } catch { return val; }
          }
          return String(val);
        })
      );

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = headers.map((h, i) => ({ wch: Math.min(Math.max(h.length, ...rows.map(r => (r[i] || '').length)) + 2, 40) }));
      const wb = XLSX.utils.book_new();
      const sheetName = !allCuerdas && selectedCuerdas.size === 1 ? `Cuerda ${Array.from(selectedCuerdas)[0]}` : 'Contactos';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `Reporte_${churchName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showSuccess(`${data.length} contactos exportados.`);
    } catch { showError('Error inesperado.'); } finally { setGenerating(false); }
  };

  return (
    <>
      {inline ? (
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setOpen(true)}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> Reporte
        </Button>
      ) : (
        <div className="p-4 rounded border">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Reporte Personalizado</div>
              <p className="text-xs text-muted-foreground mt-1">Elegí columnas, filtrá y descargá en Excel</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" /> Crear Reporte
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Reporte</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cuerda multi-select */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Cuerdas</label>
                <button className="text-[10px] text-primary hover:underline" onClick={selectAllCuerdas}>
                  {allCuerdas ? '✓ Todas seleccionadas' : 'Seleccionar todas'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CUERDAS.map(n => {
                  const selected = allCuerdas || selectedCuerdas.has(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleCuerda(n)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${selected ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Estado filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <select className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="nuevo">Nuevo</option>
                <option value="contactado">Contactado</option>
                <option value="visito_celula">Visitó célula</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            {/* Column selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Columnas</label>
                <div className="flex gap-2">
                  <button className="text-[10px] text-primary hover:underline" onClick={selectAllFields}>Todas</button>
                  <button className="text-[10px] text-primary hover:underline" onClick={deselectAllFields}>Ninguna</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {fields.map(f => (
                  <label key={f.key} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                    <input type="checkbox" checked={f.checked} onChange={() => toggleField(f.key)} className="rounded" />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={generateReport} disabled={generating}>
                <Download className="h-4 w-4" /> {generating ? 'Generando...' : 'Descargar Excel'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CustomReportBuilder;
