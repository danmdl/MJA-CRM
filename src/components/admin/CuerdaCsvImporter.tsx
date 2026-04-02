"use client";
import React, { useState, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import AddressAutocomplete from './AddressAutocomplete';

// The fields we support mapping from CSV
const CUERDA_FIELDS = [
  { key: 'numero', label: 'Número de Cuerda', required: true },
  { key: 'zona_nombre', label: 'Zona', required: true },
  { key: 'address', label: 'Dirección', required: false },
  { key: 'referente_name', label: 'Referente de Cuerda', required: false },
  { key: 'meeting_day', label: 'Día de reunión', required: false },
  { key: 'meeting_time', label: 'Hora de reunión', required: false },
];

interface CuerdaCsvImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  zonas: { id: string; nombre: string }[];
  onSuccess: () => void;
}

interface ParsedCuerda {
  numero: string;
  zona_nombre: string;
  zona_id: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  referente_name: string;
  meeting_day: string;
  meeting_time: string;
  addressResolved: boolean;
  error?: string;
}

const CuerdaCsvImporter = ({ open, onOpenChange, churchId, zonas, onSuccess }: CuerdaCsvImporterProps) => {
  const [step, setStep] = useState<'upload' | 'map' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [parsedCuerdas, setParsedCuerdas] = useState<ParsedCuerda[]>([]);
  const [editingAddress, setEditingAddress] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setCsvData([]);
    setColumnMapping({});
    setParsedCuerdas([]);
    setEditingAddress(null);
    setImporting(false);
    setImportResult(null);
  };

  // ─── Step 1: Parse CSV ─────────────────────────────────────────
  const handleFile = (f: File) => {
    setFile(f);
    setImportResult(null);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const headers = (results.meta.fields || []).filter(h => h && h.trim() !== '');
        setCsvHeaders(headers);
        setCsvData(results.data as Record<string, string>[]);

        // Auto-map columns
        const mapping: Record<string, string | null> = {};
        CUERDA_FIELDS.forEach(field => {
          const match = headers.find(h =>
            normalize(h).includes(normalize(field.label)) ||
            normalize(h).includes(normalize(field.key)) ||
            (field.key === 'numero' && normalize(h).includes('cuerda')) ||
            (field.key === 'zona_nombre' && normalize(h).includes('zona')) ||
            (field.key === 'address' && (normalize(h).includes('direcc') || normalize(h).includes('address'))) ||
            (field.key === 'referente_name' && (normalize(h).includes('referente') || normalize(h).includes('lider') || normalize(h).includes('líder'))) ||
            (field.key === 'meeting_day' && (normalize(h).includes('dia') || normalize(h).includes('día') || normalize(h).includes('day'))) ||
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

  // ─── Step 2: Process mapping → build parsed rows ───────────────
  const requiredMissing = useMemo(() =>
    CUERDA_FIELDS.filter(f => f.required && !columnMapping[f.key]),
    [columnMapping]
  );

  const processMapping = () => {
    const rows: ParsedCuerda[] = csvData.map(row => {
      const numero = (columnMapping.numero ? row[columnMapping.numero] : '').trim();
      const zonaNombre = (columnMapping.zona_nombre ? row[columnMapping.zona_nombre] : '').trim();
      const address = (columnMapping.address ? row[columnMapping.address] : '').trim();
      const referente = (columnMapping.referente_name ? row[columnMapping.referente_name] : '').trim();
      const day = (columnMapping.meeting_day ? row[columnMapping.meeting_day] : '').trim();
      const time = (columnMapping.meeting_time ? row[columnMapping.meeting_time] : '').trim();

      // Match zona
      const matchedZona = zonas.find(z => normalize(z.nombre) === normalize(zonaNombre));

      return {
        numero,
        zona_nombre: zonaNombre,
        zona_id: matchedZona?.id || null,
        address,
        lat: null,
        lng: null,
        referente_name: referente,
        meeting_day: day,
        meeting_time: time,
        addressResolved: false,
        error: !numero ? 'Falta número de cuerda' : !matchedZona ? `Zona "${zonaNombre}" no encontrada` : undefined,
      };
    }).filter(r => r.numero); // Skip empty rows

    setParsedCuerdas(rows);
    setStep('review');
  };

  // ─── Step 3: Review — address lookup per row ───────────────────
  const updateAddress = (index: number, address: string, lat?: number, lng?: number) => {
    setParsedCuerdas(prev => prev.map((c, i) => i === index ? {
      ...c,
      address,
      lat: lat ?? c.lat,
      lng: lng ?? c.lng,
      addressResolved: lat !== undefined && lng !== undefined,
    } : c));
    setEditingAddress(null);
  };

  const updateField = (index: number, field: keyof ParsedCuerda, value: string) => {
    setParsedCuerdas(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const fixZona = (index: number, zonaId: string) => {
    const zona = zonas.find(z => z.id === zonaId);
    setParsedCuerdas(prev => prev.map((c, i) => i === index ? {
      ...c, zona_id: zonaId, zona_nombre: zona?.nombre || c.zona_nombre, error: undefined,
    } : c));
  };

  const removeRow = (index: number) => {
    setParsedCuerdas(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Import ────────────────────────────────────────────────────
  const handleImport = async () => {
    const validRows = parsedCuerdas.filter(c => c.zona_id && c.numero && !c.error);
    if (validRows.length === 0) {
      showError('No hay filas válidas para importar.');
      return;
    }

    setImporting(true);
    const toastId = showLoading('Importando cuerdas...');
    const errors: string[] = [];
    let success = 0;

    for (const cuerda of validRows) {
      const { error } = await supabase.from('cuerdas').upsert({
        numero: cuerda.numero,
        zona_id: cuerda.zona_id!,
        address: cuerda.address || null,
        lat: cuerda.lat,
        lng: cuerda.lng,
        referente_name: cuerda.referente_name || null,
        meeting_day: cuerda.meeting_day || null,
        meeting_time: cuerda.meeting_time || null,
      }, { onConflict: 'numero,zona_id', ignoreDuplicates: false });

      if (error) {
        // If upsert fails (no unique constraint), try insert
        const { error: insertError } = await supabase.from('cuerdas').insert({
          numero: cuerda.numero,
          zona_id: cuerda.zona_id!,
          address: cuerda.address || null,
          lat: cuerda.lat,
          lng: cuerda.lng,
          referente_name: cuerda.referente_name || null,
          meeting_day: cuerda.meeting_day || null,
          meeting_time: cuerda.meeting_time || null,
        });
        if (insertError) {
          errors.push(`Cuerda ${cuerda.numero}: ${insertError.message}`);
        } else {
          success++;
        }
      } else {
        success++;
      }
    }

    dismissToast(toastId as string);
    setImporting(false);
    setImportResult({ success, errors });

    if (success > 0) {
      showSuccess(`${success} cuerda(s) importadas correctamente.`);
      onSuccess();
    }
    if (errors.length > 0) {
      showError(`${errors.length} error(es) durante la importación.`);
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Cuerdas desde CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Seleccioná un archivo CSV con los datos de las cuerdas.'}
            {step === 'map' && 'Mapeá las columnas del CSV a los campos de cuerda.'}
            {step === 'review' && 'Revisá los datos antes de importar. Podés corregir las direcciones buscándolas.'}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Step 1: Upload ────────────────────────────────── */}
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
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="hidden"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Formato esperado del CSV:</p>
              <p>Número de Cuerda, Zona, Dirección, Referente de Cuerda, Día, Hora</p>
              <p className="text-[11px]">Solo "Número de Cuerda" y "Zona" son obligatorios.</p>
            </div>
          </div>
        )}

        {/* ─── Step 2: Column Mapping ────────────────────────── */}
        {step === 'map' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {csvData.length} fila(s) encontradas en <strong>{file?.name}</strong>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CUERDA_FIELDS.map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Select
                    value={columnMapping[field.key] ?? '__none__'}
                    onValueChange={v => setColumnMapping(prev => ({ ...prev, [field.key]: v === '__none__' ? null : v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar columna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(No mapear)</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {requiredMissing.length > 0 && (
              <p className="text-xs text-red-500">
                Campos obligatorios sin mapear: {requiredMissing.map(f => f.label).join(', ')}
              </p>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>Volver</Button>
              <Button size="sm" onClick={processMapping} disabled={requiredMissing.length > 0}>
                Continuar a revisión
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Review & Address Lookup ───────────────── */}
        {step === 'review' && (
          <div className="space-y-4 py-2">
            <div className="flex gap-3 text-xs">
              <Badge variant="secondary">{parsedCuerdas.length} filas</Badge>
              <Badge className="bg-green-500/15 text-green-500">{parsedCuerdas.filter(c => !c.error).length} válidas</Badge>
              {parsedCuerdas.some(c => c.error) && (
                <Badge className="bg-red-500/15 text-red-500">{parsedCuerdas.filter(c => c.error).length} con error</Badge>
              )}
              <Badge className="bg-blue-500/15 text-blue-500">{parsedCuerdas.filter(c => c.addressResolved).length} direcciones confirmadas</Badge>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">N° Cuerda</TableHead>
                    <TableHead className="w-28">Zona</TableHead>
                    <TableHead className="min-w-[220px]">Dirección</TableHead>
                    <TableHead className="w-32">Referente</TableHead>
                    <TableHead className="w-24">Día</TableHead>
                    <TableHead className="w-20">Hora</TableHead>
                    <TableHead className="w-16">Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedCuerdas.map((c, i) => (
                    <TableRow key={i} className={c.error ? 'bg-red-500/5' : ''}>
                      <TableCell className="font-mono font-bold text-sm">{c.numero}</TableCell>
                      <TableCell>
                        {c.zona_id ? (
                          <span className="text-xs">{c.zona_nombre}</span>
                        ) : (
                          <Select onValueChange={v => fixZona(i, v)}>
                            <SelectTrigger className="h-7 text-xs border-red-500/50">
                              <SelectValue placeholder={c.zona_nombre || 'Elegir...'} />
                            </SelectTrigger>
                            <SelectContent>
                              {zonas.map(z => (
                                <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingAddress === i ? (
                          <div className="min-w-[240px]">
                            <AddressAutocomplete
                              value={c.address}
                              onChange={(addr, lat, lng) => updateAddress(i, addr, lat, lng)}
                              placeholder="Buscar dirección..."
                            />
                          </div>
                        ) : (
                          <button
                            className="text-xs text-left hover:underline flex items-center gap-1 max-w-[220px]"
                            onClick={() => setEditingAddress(i)}
                            title="Clic para buscar dirección"
                          >
                            <MapPin className={`h-3 w-3 flex-shrink-0 ${c.addressResolved ? 'text-green-500' : 'text-muted-foreground'}`} />
                            <span className="truncate">{c.address || '(clic para buscar)'}</span>
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{c.referente_name || '—'}</TableCell>
                      <TableCell className="text-xs">{c.meeting_day || '—'}</TableCell>
                      <TableCell className="text-xs">{c.meeting_time || '—'}</TableCell>
                      <TableCell>
                        {c.error ? (
                          <Badge variant="outline" className="text-[9px] text-red-500 border-red-500/30 whitespace-nowrap">
                            {c.error}
                          </Badge>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeRow(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {importResult && (
              <div className={`text-sm p-3 rounded-md ${importResult.errors.length > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <p className="font-medium">{importResult.success} cuerda(s) importadas correctamente.</p>
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500 mt-1">{err}</p>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('map')}>Volver al mapeo</Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing || parsedCuerdas.filter(c => !c.error).length === 0}
              >
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-1.5" /> Importar {parsedCuerdas.filter(c => !c.error).length} cuerda(s)</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CuerdaCsvImporter;
