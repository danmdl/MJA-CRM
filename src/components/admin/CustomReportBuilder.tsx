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

interface Props {
  churchId: string;
  churchName: string;
}

const CustomReportBuilder = ({ churchId, churchName }: Props) => {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ReportField[]>(ALL_FIELDS.map(f => ({ ...f })));
  const [cuerdaFilter, setCuerdaFilter] = useState<string>('all');
  const [estadoFilter, setEstadoFilter] = useState<string>('all');
  const [generating, setGenerating] = useState(false);

  const toggleField = (key: string) => {
    setFields(prev => prev.map(f => f.key === key ? { ...f, checked: !f.checked } : f));
  };

  const selectAll = () => setFields(prev => prev.map(f => ({ ...f, checked: true })));
  const deselectAll = () => setFields(prev => prev.map(f => ({ ...f, checked: false })));

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

      if (cuerdaFilter !== 'all') query = query.eq('numero_cuerda', cuerdaFilter);
      if (estadoFilter !== 'all') query = query.eq('estado_seguimiento', estadoFilter);

      const { data, error } = await query;
      if (error || !data) { showError('Error al generar el reporte.'); return; }

      // Build headers from selected fields
      const headers = fields.filter(f => f.checked).map(f => f.label);
      const rows = data.map((row: any) =>
        fields.filter(f => f.checked).map(f => {
          const val = row[f.key];
          if (val === null || val === undefined) return '';
          if (f.key === 'created_at' || f.key === 'fecha_contacto' || f.key === 'date_of_birth') {
            try { return new Date(val).toLocaleDateString('es-AR'); } catch { return val; }
          }
          return String(val);
        })
      );

      // Create XLSX
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // Auto-size columns
      ws['!cols'] = headers.map((h, i) => {
        const maxLen = Math.max(h.length, ...rows.map(r => (r[i] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      const wb = XLSX.utils.book_new();
      const sheetName = cuerdaFilter !== 'all' ? `Cuerda ${cuerdaFilter}` : 'Todos';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      
      const fileName = `Reporte_${churchName.replace(/\s/g, '_')}_${cuerdaFilter !== 'all' ? `Cuerda${cuerdaFilter}_` : ''}${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showSuccess(`${data.length} contactos exportados.`);
    } catch (err) {
      showError('Error inesperado al generar el reporte.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="p-4 rounded border">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Reporte Personalizado</div>
            <p className="text-xs text-muted-foreground mt-1">Elegí columnas, filtrá por cuerda o estado, y descargá en Excel</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> Crear Reporte
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Reporte Personalizado</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Filtrar por Cuerda</label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={cuerdaFilter} onChange={e => setCuerdaFilter(e.target.value)}>
                  <option value="all">Todas las cuerdas</option>
                  {['101','102','103','104','105','106','107','108','109','110','201','202','203','204','205','206','207','208','209','210','301','302'].map(n => (
                    <option key={n} value={n}>Cuerda {n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Filtrar por Estado</label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                  <option value="all">Todos los estados</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="contactado">Contactado</option>
                  <option value="visito_celula">Visitó célula</option>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            {/* Column selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Columnas del reporte</label>
                <div className="flex gap-2">
                  <button className="text-[10px] text-primary hover:underline" onClick={selectAll}>Todas</button>
                  <button className="text-[10px] text-primary hover:underline" onClick={deselectAll}>Ninguna</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {fields.map(f => (
                  <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={f.checked} onChange={() => toggleField(f.key)} className="rounded" />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={generateReport} disabled={generating}>
                <Download className="h-4 w-4" />
                {generating ? 'Generando...' : 'Descargar Excel'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CustomReportBuilder;
