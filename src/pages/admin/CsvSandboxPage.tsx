"use client";
// CSV Sandbox: validate a CSV/Excel against the production import engine
// without writing anything to the database. Same transform/validation/
// dedupe logic the live importer uses (extracted to lib/csv-import-engine).
//
// Flow mirrors the live importer until the final step:
//   1. Pick file → parse rows + headers
//   2. Map columns → which CSV column feeds which contact field
//   3. Run dry-run → renders a per-row preview + summary
//
// What the sandbox catches:
//   - Missing required fields (Sexo)
//   - Date format errors
//   - Phone duplicates against existing contacts in the chosen church
//   - Phone duplicates within the file itself (production would let one in
//     and the rest would fail at insert; sandbox flags all but the first)
//   - Phone format warnings (Argentine mobile, non-fatal)
//
// What it doesn't simulate:
//   - The DB-side numero_cuerda <-> auto_assign_responsable_trigger flow
//     (we'd need to read the trigger logic; not worth duplicating). Rows
//     that pass dry-run still might end up with an unexpected responsable
//     in production, but that's a routing decision, not a validation gate.

import React, { useMemo, useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlaskConical, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { showError } from '@/utils/toast';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import {
  dryRunImport, buildDuplicatePhonesMap, normalizePhoneForDedupe,
  type DryRunResult,
} from '@/lib/csv-import-engine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const REQUIRED = CONTACT_FIELDS.filter(f => f.key === 'first_name' || f.key === 'sexo');
const OPTIONAL = CONTACT_FIELDS.filter(f => f.key !== 'first_name' && f.key !== 'sexo' && f.key !== 'barrio' && f.key !== 'leader_assigned');
const ALL_FIELDS = [...REQUIRED, ...OPTIONAL];

const CsvSandboxPage = () => {
  const { profile } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [targetChurchId, setTargetChurchId] = useState<string>('');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);

  // Churches the admin can pick as the dedupe target. Only roles that already
  // see across churches need the picker; for everyone else the sandbox auto-
  // pins to their assigned church and hides the dropdown.
  const canSeeAllChurches = profile?.role === 'admin' || profile?.role === 'general';
  const { data: churches } = useQuery({
    queryKey: ['sandbox-churches'],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('id, name').order('name');
      return data || [];
    },
    enabled: canSeeAllChurches,
  });

  // Pre-pin the church once profile loads
  React.useEffect(() => {
    if (!targetChurchId && profile?.church_id) setTargetChurchId(profile.church_id);
  }, [profile?.church_id, targetChurchId]);

  // Existing phones in the chosen church (alive only). Loaded once per church
  // change; the dry-run uses this set to flag "duplicate vs production".
  const { data: existingPhones } = useQuery({
    queryKey: ['sandbox-existing-phones', targetChurchId],
    queryFn: async () => {
      if (!targetChurchId) return new Set<string>();
      const { data } = await supabase
        .from('contacts')
        .select('phone')
        .eq('church_id', targetChurchId)
        .is('deleted_at', null)
        .not('phone', 'is', null);
      const set = new Set<string>();
      (data || []).forEach((c: any) => {
        const n = normalizePhoneForDedupe(c.phone);
        if (n.length >= 8) set.add(n);
      });
      return set;
    },
    enabled: !!targetChurchId,
    staleTime: 60_000,
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setData([]);
    setHeaders([]);
    setColumnMapping({});
    setResult(null);
    setParsing(true);

    const isExcel = /\.xlsx?$/i.test(f.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, string>[];
          if (!json.length) { showError('El archivo está vacío.'); setParsing(false); return; }
          const hdrs = Object.keys(json[0]);
          setHeaders(hdrs);
          setData(json);
          autoMatch(hdrs);
        } catch (err: any) {
          showError(`Error al leer Excel: ${err.message}`);
        } finally {
          setParsing(false);
        }
      };
      reader.readAsArrayBuffer(f);
    } else {
      Papa.parse<Record<string, string>>(f, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (!res.data.length) { showError('El archivo está vacío.'); setParsing(false); return; }
          const hdrs = res.meta.fields || [];
          setHeaders(hdrs);
          setData(res.data);
          autoMatch(hdrs);
          setParsing(false);
        },
        error: (err) => { showError(`Error al leer CSV: ${err.message}`); setParsing(false); },
      });
    }
  };

  // Heuristic auto-match: same-name (case insensitive) lands on the right field.
  // This is intentionally lax — the user reviews the mapping before running.
  const autoMatch = (hdrs: string[]) => {
    const mapping: Record<string, string | null> = {};
    ALL_FIELDS.forEach(f => {
      const match = hdrs.find(h =>
        h.toLowerCase() === f.label.toLowerCase() ||
        h.toLowerCase() === f.key.toLowerCase() ||
        h.toLowerCase().replace(/_/g, ' ') === f.label.toLowerCase()
      );
      mapping[f.key] = match || null;
    });
    setColumnMapping(mapping);
  };

  const requiredMissing = useMemo(
    () => REQUIRED.filter(f => !columnMapping[f.key]),
    [columnMapping]
  );

  const handleDryRun = () => {
    if (requiredMissing.length > 0) {
      showError(`Mapeá primero los campos requeridos: ${requiredMissing.map(f => f.label).join(', ')}`);
      return;
    }
    if (!targetChurchId) {
      showError('Elegí una iglesia para validar contra duplicados.');
      return;
    }
    setRunning(true);
    // Defer to next tick so the loading state actually paints before the
    // (potentially expensive on big files) loop starts.
    setTimeout(() => {
      const phoneHeader = columnMapping.phone || null;
      const r = dryRunImport({
        data,
        columnMapping,
        allTargetFields: ALL_FIELDS,
        tableName: 'contacts',
        defaultCuerda: profile?.numero_cuerda || null,
        existingPhonesNormalized: existingPhones || new Set(),
        duplicatePhonesInFile: buildDuplicatePhonesMap(data, phoneHeader),
      });
      setResult(r);
      setRunning(false);
    }, 50);
  };

  // Download a CSV of just the rejected rows so the user can fix and retry.
  // Same shape as the production "fallidos" CSV in the Historial.
  const downloadRejectedCsv = () => {
    if (!result) return;
    const rejected = result.rows.filter(r => r.willBeRejected);
    if (!rejected.length) return;
    const allHeaders = headers.slice();
    const escape = (v: string) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      [...allHeaders, 'fila', 'motivos'].map(escape).join(','),
      ...rejected.map(r =>
        [
          ...allHeaders.map(h => r.raw[h] || ''),
          String(r.rowNumber),
          r.validationErrors.filter(e => !e.message.includes('(advertencia)')).map(e => e.message).join('; '),
        ].map(escape).join(',')
      ),
    ];
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sandbox_rechazados_${file?.name || 'import'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setData([]);
    setHeaders([]);
    setColumnMapping({});
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Sandbox de Importación</h1>
          <p className="text-xs text-muted-foreground">
            Probá un CSV o Excel con el mismo motor de validación que producción. Nada se guarda en la base.
          </p>
        </div>
      </div>

      {/* Step 1: File picker + church selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Archivo + iglesia</CardTitle>
          <CardDescription className="text-xs">
            Elegí el archivo y la iglesia contra la cual se chequearán teléfonos duplicados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Archivo (.csv, .xlsx, .xls)</Label>
              <Input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-xs h-9" />
            </div>
            {canSeeAllChurches && (
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Iglesia destino (para dedupe)</Label>
                <Select value={targetChurchId} onValueChange={setTargetChurchId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Elegir iglesia..." /></SelectTrigger>
                  <SelectContent>
                    {(churches || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {file && (
              <Button variant="outline" size="sm" onClick={reset} className="h-9 text-xs">Reiniciar</Button>
            )}
          </div>
          {file && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>{file.name}</span>
              {data.length > 0 && <span>· {data.length} filas detectadas</span>}
              {parsing && <span>· Procesando...</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Column mapping */}
      {data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Mapear columnas</CardTitle>
            <CardDescription className="text-xs">
              Asociá cada campo del sistema con la columna correspondiente del archivo. Los marcados con * son obligatorios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_FIELDS.map(f => {
                const isRequired = REQUIRED.some(r => r.key === f.key);
                return (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="text-xs w-1/3 truncate">{f.label}{isRequired && <span className="text-red-400"> *</span>}</span>
                    <Select
                      value={columnMapping[f.key] ?? '__none__'}
                      onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [f.key]: v === '__none__' ? null : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin mapear —</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Run + results */}
      {data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Validar</CardTitle>
            <CardDescription className="text-xs">
              Corre la validación. Resultado en pantalla, nada se persiste.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDryRun} disabled={running || requiredMissing.length > 0 || !targetChurchId}>
              {running ? 'Validando...' : 'Correr validación'}
            </Button>
            {requiredMissing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Faltan campos obligatorios: {requiredMissing.map(f => f.label).join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Top-line metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                <div className="text-2xl font-semibold">{result.totalCount}</div>
              </div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-green-400">Importarían</div>
                <div className="text-2xl font-semibold text-green-400">{result.validCount}</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-red-400">Rechazadas</div>
                <div className="text-2xl font-semibold text-red-400">{result.invalidCount}</div>
              </div>
            </div>

            {/* Error breakdown */}
            {Object.keys(result.errorSummary).length > 0 && (
              <div className="rounded-lg border bg-muted/10 p-3 space-y-1">
                <div className="text-xs font-medium">Motivos de rechazo</div>
                {Object.entries(result.errorSummary)
                  .sort((a, b) => b[1] - a[1])
                  .map(([msg, count]) => (
                    <div key={msg} className="flex items-center justify-between text-xs gap-3">
                      <span className="truncate text-muted-foreground">{msg}</span>
                      <span className="text-red-400 tabular-nums shrink-0">{count}</span>
                    </div>
                  ))}
              </div>
            )}

            {result.invalidCount > 0 && (
              <Button variant="outline" size="sm" onClick={downloadRejectedCsv}>
                Descargar CSV de rechazados
              </Button>
            )}

            {/* Per-row preview tabs */}
            <Tabs defaultValue="invalid">
              <TabsList>
                <TabsTrigger value="invalid">
                  <AlertCircle className="h-3.5 w-3.5 mr-1 text-red-400" />
                  Rechazadas ({result.invalidCount})
                </TabsTrigger>
                <TabsTrigger value="valid">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-400" />
                  Importarían ({result.validCount})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="invalid" className="mt-3">
                <RowList
                  rows={result.rows.filter(r => r.willBeRejected)}
                  emptyMessage="Sin filas rechazadas. ✅"
                />
              </TabsContent>
              <TabsContent value="valid" className="mt-3">
                <RowList
                  rows={result.rows.filter(r => !r.willBeRejected)}
                  emptyMessage="Ninguna fila pasaría la validación."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface RowListProps {
  rows: Array<{
    rowNumber: number;
    raw: Record<string, string>;
    transformed: Record<string, any> | null;
    validationErrors: { field: string; value: string; message: string }[];
    willBeRejected: boolean;
  }>;
  emptyMessage: string;
}

const RowList = ({ rows, emptyMessage }: RowListProps) => {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded">{emptyMessage}</div>;
  }
  // Cap at 200 in the DOM — bigger than that and the UI struggles. The
  // CSV download button above is the right tool for full data export.
  const visible = rows.slice(0, 200);
  const truncated = rows.length > visible.length;
  return (
    <div className="rounded border max-h-[500px] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
          <tr className="border-b">
            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-12">Fila</th>
            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Datos</th>
            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-1/3">Notas</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(r => (
            <tr key={r.rowNumber} className="border-b last:border-b-0">
              <td className="px-2 py-1.5 align-top tabular-nums text-muted-foreground">{r.rowNumber}</td>
              <td className="px-2 py-1.5 align-top">
                {Object.entries(r.raw).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="truncate" title={`${k}: ${v}`}>
                    <span className="text-muted-foreground">{k}:</span> {String(v) || '—'}
                  </div>
                ))}
                {Object.keys(r.raw).length > 4 && (
                  <div className="text-[10px] text-muted-foreground italic">+ {Object.keys(r.raw).length - 4} más</div>
                )}
              </td>
              <td className="px-2 py-1.5 align-top">
                {r.validationErrors.length === 0 ? (
                  <span className="text-green-400">OK</span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.validationErrors.map((e, i) => (
                      <li key={i} className={e.message.includes('(advertencia)') ? 'text-yellow-400' : 'text-red-400'}>
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="text-xs text-muted-foreground py-2 text-center bg-muted/10">
          Mostrando primeras 200 de {rows.length}. Descargá el CSV para ver todas.
        </div>
      )}
    </div>
  );
};

export default CsvSandboxPage;
