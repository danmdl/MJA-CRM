"use client";
import React, { useState, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, X, MapPin, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import AddressAutocomplete from './AddressAutocomplete';

const CELL_FIELDS = [
  { key: 'name', label: 'Nombre de Célula', required: true },
  { key: 'cuerda_numero', label: 'Número de Cuerda', required: false },
  { key: 'address', label: 'Dirección', required: false },
  { key: 'leader_name', label: 'Líder de Célula', required: false },
  { key: 'anfitrion_name', label: 'Anfitrión', required: false },
  { key: 'meeting_day', label: 'Día de reunión', required: false },
  { key: 'meeting_time', label: 'Hora de reunión', required: false },
];

interface CellCsvImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  cuerdas: { id: string; numero: string; zona_id: string }[];
  leaders: { id: string; name: string }[];
  onSuccess: () => void;
}

interface ParsedCell {
  name: string;
  cuerda_numero: string;
  cuerda_id: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  leader_name: string;
  anfitrion_name: string;
  meeting_day: string;
  meeting_time: string;
  addressResolved: boolean;
  error?: string;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const CellCsvImporter = ({ open, onOpenChange, churchId, cuerdas, leaders, onSuccess }: CellCsvImporterProps) => {
  const [step, setStep] = useState<'upload' | 'map' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [parsedCells, setParsedCells] = useState<ParsedCell[]>([]);
  const [editingAddress, setEditingAddress] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload'); setFile(null); setCsvHeaders([]); setCsvData([]);
    setColumnMapping({}); setParsedCells([]); setEditingAddress(null);
    setImporting(false); setImportResult(null);
  };

  const handleFile = (f: File) => {
    setFile(f); setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      Papa.parse(text, {
        header: true, skipEmptyLines: 'greedy',
        complete: (results) => {
        const headers = (results.meta.fields || []).filter(h => h && h.trim() !== '');
        setCsvHeaders(headers);
        setCsvData(results.data as Record<string, string>[]);
        const mapping: Record<string, string | null> = {};
        CELL_FIELDS.forEach(field => {
          const match = headers.find(h =>
            normalize(h).includes(normalize(field.label)) ||
            normalize(h).includes(normalize(field.key)) ||
            (field.key === 'name' && (normalize(h).includes('nombre') || normalize(h).includes('celula'))) ||
            (field.key === 'cuerda_numero' && normalize(h).includes('cuerda')) ||
            (field.key === 'address' && (normalize(h).includes('direcc') || normalize(h).includes('address'))) ||
            (field.key === 'leader_name' && (normalize(h).includes('lider') || normalize(h).includes('líder') || normalize(h).includes('leader'))) ||
            (field.key === 'anfitrion_name' && (normalize(h).includes('anfitr') || normalize(h).includes('host'))) ||
            (field.key === 'meeting_day' && (normalize(h).includes('dia') || normalize(h).includes('día'))) ||
            (field.key === 'meeting_time' && (normalize(h).includes('hora') || normalize(h).includes('time')))
          );
          mapping[field.key] = match || null;
        });
        setColumnMapping(mapping);
        setStep('map');
      },
      error: () => showError('Error al leer el archivo CSV.'),
    });
    };
    reader.readAsText(f, 'UTF-8');
  };

  const requiredMissing = useMemo(() =>
    CELL_FIELDS.filter(f => f.required && !columnMapping[f.key]), [columnMapping]);

  const processMapping = () => {
    const rows: ParsedCell[] = csvData.map(row => {
      const name = (columnMapping.name ? row[columnMapping.name] : '').trim();
      const cuerdaNum = (columnMapping.cuerda_numero ? row[columnMapping.cuerda_numero] : '').trim();
      const address = (columnMapping.address ? row[columnMapping.address] : '').trim();
      const leaderName = (columnMapping.leader_name ? row[columnMapping.leader_name] : '').trim();
      const anfitrionName = (columnMapping.anfitrion_name ? row[columnMapping.anfitrion_name] : '').trim();
      const day = (columnMapping.meeting_day ? row[columnMapping.meeting_day] : '').trim();
      const time = (columnMapping.meeting_time ? row[columnMapping.meeting_time] : '').trim();

      const matchedCuerda = cuerdas.find(c => c.numero === cuerdaNum);

      return {
        name, cuerda_numero: cuerdaNum, cuerda_id: matchedCuerda?.id || null,
        address, lat: null, lng: null, leader_name: leaderName, anfitrion_name: anfitrionName,
        meeting_day: day, meeting_time: time, addressResolved: false,
        error: !name ? 'Falta nombre' : undefined,
      };
    }).filter(r => r.name);

    setParsedCells(rows);
    setStep('review');
  };

  const updateAddress = (index: number, address: string, lat?: number, lng?: number) => {
    setParsedCells(prev => prev.map((c, i) => i === index ? {
      ...c, address, lat: lat ?? c.lat, lng: lng ?? c.lng,
      addressResolved: lat !== undefined && lng !== undefined,
    } : c));
    setEditingAddress(null);
  };

  const removeRow = (index: number) => {
    setParsedCells(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validRows = parsedCells.filter(c => !c.error && c.name);
    if (validRows.length === 0) { showError('No hay filas válidas.'); return; }

    setImporting(true);
    const toastId = showLoading('Importando células...');
    const errors: string[] = [];
    let success = 0;

    for (const cell of validRows) {
      // Try to match leader by name
      let encargadoId: string | null = null;
      if (cell.leader_name) {
        const match = leaders.find(l => normalize(l.name).includes(normalize(cell.leader_name)));
        if (match) encargadoId = match.id;
      }

      const { error } = await supabase.from('cells').insert({
        name: cell.name,
        church_id: churchId,
        cuerda_id: cell.cuerda_id || null,
        encargado_id: encargadoId,
        address: cell.address || null,
        lat: cell.lat, lng: cell.lng,
        meeting_day: cell.meeting_day || null,
        meeting_time: cell.meeting_time || null,
      });

      if (error) {
        errors.push(`${cell.name}: ${error.message}`);
      } else {
        success++;
      }
    }

    dismissToast(toastId as string);
    setImporting(false);
    setImportResult({ success, errors });
    if (success > 0) { showSuccess(`${success} célula(s) importadas.`); onSuccess(); }
    if (errors.length > 0) showError(`${errors.length} error(es).`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Células desde CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Seleccioná un archivo CSV con los datos de las células.'}
            {step === 'map' && 'Mapeá las columnas del CSV a los campos.'}
            {step === 'review' && 'Revisá y corregí las direcciones antes de importar.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Seleccionar archivo
              </Button>
              <div
                className="flex-1 border-2 border-dashed rounded p-6 text-center text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                onClick={() => fileInputRef.current?.click()}
              >
                Arrastrá el archivo CSV acá
              </div>
            </div>
            <Input ref={fileInputRef} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">Campos: Nombre de Célula (obligatorio), N° Cuerda, Dirección, Líder, Anfitrión, Día, Hora</p>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{csvData.length} fila(s) en <strong>{file?.name}</strong></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CELL_FIELDS.map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs">{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
                  <Select value={columnMapping[field.key] ?? '__none__'} onValueChange={v => setColumnMapping(prev => ({ ...prev, [field.key]: v === '__none__' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(No mapear)</SelectItem>
                      {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {requiredMissing.length > 0 && <p className="text-xs text-red-500">Obligatorios sin mapear: {requiredMissing.map(f => f.label).join(', ')}</p>}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>Volver</Button>
              <Button size="sm" onClick={processMapping} disabled={requiredMissing.length > 0}>Continuar</Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 py-2">
            <div className="flex gap-3 text-xs">
              <Badge variant="secondary">{parsedCells.length} filas</Badge>
              <Badge className="bg-green-500/15 text-green-500">{parsedCells.filter(c => !c.error).length} válidas</Badge>
            </div>
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-20">Cuerda</TableHead>
                    <TableHead className="min-w-[200px]">Dirección</TableHead>
                    <TableHead>Líder</TableHead>
                    <TableHead>Anfitrión</TableHead>
                    <TableHead className="w-20">Día</TableHead>
                    <TableHead className="w-16">Hora</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedCells.map((c, i) => (
                    <TableRow key={i} className={c.error ? 'bg-red-500/5' : ''}>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.cuerda_numero || '—'}</TableCell>
                      <TableCell>
                        {editingAddress === i ? (
                          <div className="min-w-[220px]">
                            <AddressAutocomplete value={c.address} onChange={(addr, lat, lng) => updateAddress(i, addr, lat, lng)} placeholder="Buscar dirección..." />
                          </div>
                        ) : (
                          <button className="text-xs text-left hover:underline flex items-center gap-1" onClick={() => setEditingAddress(i)}>
                            <MapPin className={`h-3 w-3 flex-shrink-0 ${c.addressResolved ? 'text-green-500' : 'text-muted-foreground'}`} />
                            <span className="truncate max-w-[180px]">{c.address || '(clic para buscar)'}</span>
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{c.leader_name || '—'}</TableCell>
                      <TableCell className="text-xs">{c.anfitrion_name || '—'}</TableCell>
                      <TableCell className="text-xs">{c.meeting_day || '—'}</TableCell>
                      <TableCell className="text-xs">{c.meeting_time || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeRow(i)}><X className="h-3 w-3" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {importResult && (
              <div className={`text-sm p-3 rounded-md ${importResult.errors.length > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <p className="font-medium">{importResult.success} célula(s) importadas.</p>
                {importResult.errors.map((err, i) => <p key={i} className="text-xs text-red-500 mt-1">{err}</p>)}
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('map')}>Volver</Button>
              <Button size="sm" onClick={handleImport} disabled={importing || parsedCells.filter(c => !c.error).length === 0}>
                {importing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importando...</> : <><Upload className="h-4 w-4 mr-1.5" /> Importar {parsedCells.filter(c => !c.error).length} célula(s)</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CellCsvImporter;
