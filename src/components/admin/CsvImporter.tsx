"use client";

import React, { useState, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { logEvent } from '@/utils/clientLogger';
import { ContactField } from '@/lib/contact-fields'; // Import ContactField type
import { useQueryClient } from '@tanstack/react-query';

interface CsvImporterProps {
  tableName: string;
  requiredFields: ContactField[]; // Updated type to ContactField[]
  optionalFields: ContactField[]; // Updated type to ContactField[]
  churchId?: string; // Add optional churchId prop
  onImportComplete?: (importedIds: string[]) => void; // Callback with imported contact IDs
}

const CsvImporter = ({ tableName, requiredFields, optionalFields, churchId, onImportComplete }: CsvImporterProps) => {
  const { session, profile } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [dataToImport, setDataToImport] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [autoMatchedFields, setAutoMatchedFields] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importErrors, setImportErrors] = useState<{row: number, field: string, value: string, message: string}[]>([]);
  const [failedContacts, setFailedContacts] = useState<{row: number, data: Record<string, string>}[]>([]);
  // Cuerda mismatch confirmation: when a non-global user with a cuerda
  // tries to import a CSV whose cuerda column has values that don't match
  // their own, we pause before touching the DB and ask them to confirm.
  // The trigger sync_contact_cuerda_with_responsable would force the
  // alignment anyway, but doing it transparently behind the user's back
  // is exactly what produced the orphan-contacts problem before — they
  // need to see and consent to what's about to happen.
  //
  // Two-step state: cuerdaConfirm holds the diagnostic info (which other
  // cuerdas appear in the file, and how many rows are affected) so the
  // dialog can render specifics. cuerdaConfirmedAction is a sticky flag
  // that survives across one round-trip — when the user clicks 'Importar
  // a mi cuerda', we set it to 'rewrite' and re-fire handleImportData,
  // which then skips the check and rewrites the CSV's cuerda column to
  // the user's cuerda before building recordsToInsert.
  const [cuerdaConfirm, setCuerdaConfirm] = useState<null | {
    distinctMismatched: string[];
    mismatchedRowCount: number;
    userCuerda: string;
  }>(null);
  const [cuerdaConfirmedAction, setCuerdaConfirmedAction] = useState<null | 'rewrite'>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const allTargetFields = useMemo(() => [...requiredFields, ...optionalFields], [requiredFields, optionalFields]);

  // Calculate unmappedRequiredFields in a useMemo hook so it's always up-to-date and accessible
  const unmappedRequiredFields = useMemo(() => {
    return requiredFields.filter(field => !columnMapping[field.key]);
  }, [requiredFields, columnMapping]);

  const requiredMissing = useMemo(() => {
    // Required field is missing if it has no mapping (ignores don't apply to required fields)
    return requiredFields.filter(f => !columnMapping[f.key]);
  }, [requiredFields, columnMapping]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      parseFile(selectedFile);
    }
  };

  const parseFile = (selectedFile: File) => {
    setFile(selectedFile);
    setImportSuccess(false);
    setImportErrors([]);
    setFailedContacts([]);
    setColumnMapping({});
    setAutoMatchedFields(new Set());

    const isXlsx = /\.xlsx?$/i.test(selectedFile.name);

    if (isXlsx) {
      // Parse XLSX with SheetJS
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
          if (jsonData.length === 0) { showError('El archivo está vacío.'); return; }
          // Convert all values to strings for consistency with CSV flow
          const headers = Object.keys(jsonData[0]).filter(h => h && h.trim() !== '');
          const stringData = jsonData.map(row => {
            const out: Record<string, string> = {};
            headers.forEach(h => { out[h] = row[h] != null ? String(row[h]) : ''; });
            return out;
          });
          processHeaders(headers, stringData);
        } catch (err) {
          console.error('Error parsing XLSX:', err);
          showError('Error al leer el archivo Excel.');
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else {
      // Parse CSV with PapaParse
      const reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target?.result as string;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        Papa.parse(text, {
          header: true,
          skipEmptyLines: 'greedy',
          complete: (results) => {
            if (results.meta.fields) {
              const validHeaders = results.meta.fields.filter(h => h && h.trim() !== '');
              processHeaders(validHeaders, results.data as Record<string, string>[]);
            } else {
              setCsvHeaders([]); setDataToImport([]);
            }
          },
          error: (error) => {
            console.error("Error parsing CSV:", error);
            showError("Error al leer el archivo CSV.");
            setCsvHeaders([]); setDataToImport([]);
          }
        });
      };
      reader.readAsText(selectedFile, 'UTF-8');
    }
  };

  // Shared logic for both CSV and XLSX after parsing headers + data.
  // Auto-detects column mapping using a rich alias table that covers common
  // Spanish header variants (with/without accents, abbreviations, synonyms).
  // Each CSV header can only be claimed by ONE target field (first match wins
  // in priority order: exact key → exact label → alias substring).
  const processHeaders = (headers: string[], data: Record<string, string>[]) => {
    setCsvHeaders(headers);

    // Strip diacritics + lowercase for fuzzy comparison
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Alias table: for each target field key, a list of strings that should
    // match CSV headers. Order matters — put the most specific first.
    const ALIASES: Record<string, string[]> = {
      first_name:         ['nombre', 'name', 'primer nombre', 'nombres'],
      last_name:          ['apellido', 'apellidos', 'last name', 'surname'],
      phone:              ['telefono', 'celular', 'cel', 'phone', 'tel', 'movil', 'mobile', 'whatsapp', 'nro telefono', 'numero telefono', 'numero celular'],
      address:            ['direccion', 'domicilio', 'address', 'calle'],
      apartment_number:   ['departamento', 'depto', 'dpto', 'piso', 'apartment', 'nro depto'],
      barrio:             ['barrio', 'localidad', 'neighborhood', 'zona barrio'],
      numero_cuerda:      ['cuerda', 'nro cuerda', 'numero cuerda', 'num cuerda'],
      zona:               ['zona'],
      leader_assigned:    ['lider', 'lider de celula', 'leader', 'lider asignado'],
      conector:           ['conector', 'connector', 'quien contacto', 'quien lo contacto'],
      estado_seguimiento: ['seguimiento', 'estado seguimiento', 'estado', 'follow up', 'status'],
      fecha_contacto:     ['fecha contacto', 'fecha de contacto', 'fecha', 'date', 'fecha ingreso'],
      date_of_birth:      ['nacimiento', 'fecha nacimiento', 'fecha de nacimiento', 'cumpleanos', 'birthday', 'date of birth', 'fdn'],
      edad:               ['edad', 'age', 'anos'],
      sexo:               ['sexo', 'genero', 'gender', 'sex', 'm/f'],
      estado_civil:       ['estado civil', 'civil', 'marital'],
      observaciones:      ['observaciones', 'observacion', 'notas', 'nota', 'notes', 'comentarios', 'comments'],
      pedido_de_oracion:  ['pedido de oracion', 'oracion', 'prayer', 'pedido oracion', 'prayer request'],
    };

    const initialMapping: Record<string, string | null> = {};
    const claimedHeaders = new Set<string>(); // prevent double-mapping

    // For each target field, try to find the best CSV header match.
    // Process in allTargetFields order so required fields get first pick.
    allTargetFields.forEach(targetField => {
      const aliases = ALIASES[targetField.key] || [targetField.label.toLowerCase(), targetField.key];
      const normedAliases = aliases.map(norm);

      let bestMatch: string | null = null;

      // Pass 1: exact match (normed CSV header === normed alias)
      for (const csvHeader of headers) {
        if (claimedHeaders.has(csvHeader)) continue;
        const nh = norm(csvHeader);
        if (normedAliases.includes(nh)) { bestMatch = csvHeader; break; }
      }

      // Pass 2: substring match (normed CSV header contains a normed alias, or vice versa)
      if (!bestMatch) {
        for (const csvHeader of headers) {
          if (claimedHeaders.has(csvHeader)) continue;
          const nh = norm(csvHeader);
          if (normedAliases.some(a => nh.includes(a) || a.includes(nh))) {
            bestMatch = csvHeader;
            break;
          }
        }
      }

      initialMapping[targetField.key] = bestMatch;
      if (bestMatch) claimedHeaders.add(bestMatch);
    });

    setColumnMapping(initialMapping);
    // Track which fields were auto-detected so we can highlight them green
    const matched = new Set<string>();
    Object.entries(initialMapping).forEach(([key, val]) => { if (val) matched.add(key); });
    setAutoMatchedFields(matched);
    setDataToImport(data);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  };

  const handleColumnMappingChange = (targetFieldKey: string, csvHeader: string) => {
    setColumnMapping(prev => ({ ...prev, [targetFieldKey]: csvHeader === '__none__' ? null : csvHeader }));
    // If user manually changes a mapping, remove it from auto-matched set
    setAutoMatchedFields(prev => { const next = new Set(prev); next.delete(targetFieldKey); return next; });
  };

  const handleImportData = async () => {
    if (!file || dataToImport.length === 0) {
      showError('Por favor, sube un archivo CSV con datos.');
      return;
    }

    // Validate required fields are mapped
    if (requiredMissing.length > 0) {
      showError(`Los siguientes campos son obligatorios y no están mapeados: ${requiredMissing.map(f => f.label).join(', ')}`);
      return;
    }

    // Cuerda mismatch UX gate. Only applies when:
    //   - the importer is a non-global role (referente, encargado, etc.)
    //   - they have a cuerda assigned on their profile
    //   - the CSV has a column mapped to numero_cuerda
    //   - some rows in that column have values different from the user's
    //     cuerda (and not blank)
    // If we already asked and the user said "rewrite", skip — the rewrite
    // will happen below before recordsToInsert is built.
    const isGlobal = profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
    const userCuerda = profile?.numero_cuerda || '';
    if (!cuerdaConfirmedAction && !isGlobal && userCuerda) {
      const csvCuerdaCol = columnMapping['numero_cuerda'];
      if (csvCuerdaCol) {
        const mismatchedRows: string[] = [];
        for (const row of dataToImport) {
          const raw = (row[csvCuerdaCol] || '').trim();
          if (!raw) continue; // blank cuerda: trigger / fallback fills it from creator, no UX warning needed
          if (raw !== userCuerda) mismatchedRows.push(raw);
        }
        if (mismatchedRows.length > 0) {
          const distinct = Array.from(new Set(mismatchedRows));
          // Sort numeric cuerdas first ascending, then non-numeric, same
          // ordering used in the column-header dropdown so it's familiar.
          distinct.sort((a, b) => {
            const an = Number(a), bn = Number(b);
            const aIsNum = !Number.isNaN(an), bIsNum = !Number.isNaN(bn);
            if (aIsNum && bIsNum) return an - bn;
            if (aIsNum) return -1;
            if (bIsNum) return 1;
            return a.localeCompare(b);
          });
          setCuerdaConfirm({
            distinctMismatched: distinct,
            mismatchedRowCount: mismatchedRows.length,
            userCuerda,
          });
          // Bail out of the import. The dialog now renders; if user
          // confirms, it'll set cuerdaConfirmedAction='rewrite' and
          // call handleImportData() again, which will pass this check.
          return;
        }
      }
    }

    setLoading(true);
    const toastId = showLoading('Importando datos...');

    try {
      // If the user confirmed "import to my cuerda", overwrite the cuerda
      // column on every row of dataToImport so the records we're about to
      // build use the user's cuerda regardless of what the CSV said. The
      // sync_contact_cuerda_with_responsable trigger would do this anyway,
      // but doing it explicitly here keeps the import log's
      // `imported_rows` snapshot consistent with what actually got
      // inserted (otherwise the snapshot would still show '104' even
      // though every row landed in '204').
      if (cuerdaConfirmedAction === 'rewrite') {
        const csvCuerdaCol = columnMapping['numero_cuerda'];
        if (csvCuerdaCol && userCuerda) {
          for (const row of dataToImport) {
            row[csvCuerdaCol] = userCuerda;
          }
        }
        // One-shot: clear the flag so a subsequent import (different file,
        // same dialog session) re-runs the check.
        setCuerdaConfirmedAction(null);
      }
      // Fields that should never be set from CSV (DB-managed)
      const BLOCKED_FIELDS = new Set(['created_at', 'id', 'church_id', 'created_by']);
      // Fields that are dates - empty/invalid values must be null
      const DATE_FIELDS = new Set(['fecha_contacto', 'date_of_birth', 'created_at']);
      // Fields that are numbers
      const NUMBER_FIELDS = new Set(['edad']);

      const sanitizeValue = (key: string, val: string): any => {
        if (val === '' || val === null || val === undefined) return null;
        const trimmed = String(val).trim();
        // Junk-only values → null for ALL fields
        if (/^[.\-,…]+$/.test(trimmed) || trimmed === 'N/A' || trimmed === 'n/a' || trimmed === '') return null;

        if (DATE_FIELDS.has(key)) {
          // Strip time part from timestamps like "2026-02-06 00:00:00"
          const dateOnly = trimmed.split(' ')[0];
          const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{2})$/;
          if (!dateRegex.test(dateOnly)) return null;
          const d = new Date(dateOnly);
          return isNaN(d.getTime()) ? null : dateOnly;
        }

        if (NUMBER_FIELDS.has(key)) {
          // Extract leading number: "16 años" → 16, "30 aprox" → 30
          const match = trimmed.match(/^(\d+)/);
          if (!match) return null;
          const n = parseInt(match[1]);
          return isNaN(n) ? null : n;
        }

        // Everything else: pass through as-is (text fields accept anything)
        return trimmed;
      };

      const recordsToInsert = dataToImport.map(row => {
        const newRecord: Record<string, any> = {};
        allTargetFields.forEach(targetField => {
          if (BLOCKED_FIELDS.has(targetField.key)) return; // Never import these
          const csvHeader = columnMapping[targetField.key];
          if (csvHeader && row[csvHeader] !== undefined) {
            newRecord[targetField.key] = sanitizeValue(targetField.key, row[csvHeader]);
          }
        });
        if (churchId) {
          newRecord.church_id = churchId;
          newRecord.created_by = session?.user?.id || null;
          // If contact doesn't have a cuerda from CSV, inherit from creator
          if (!newRecord.numero_cuerda && profile?.numero_cuerda) {
            newRecord.numero_cuerda = profile.numero_cuerda;
          }
        }
        return newRecord;
      });

      // Pre-validate rows and collect errors before inserting
      const validationErrors: {row: number, field: string, value: string, message: string}[] = [];
      recordsToInsert.forEach((record, idx) => {
        allTargetFields.forEach(f => {
          if (DATE_FIELDS.has(f.key) && record[f.key] !== null && record[f.key] !== undefined) {
            const raw = dataToImport[idx][columnMapping[f.key] || ''] || '';
            const dateOnly = String(raw).trim().split(' ')[0];
            const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{2})$/;
            if (raw && !dateRegex.test(dateOnly)) {
              validationErrors.push({ row: idx + 1, field: f.label, value: String(raw), message: 'Formato de fecha inválido (use AAAA-MM-DD)' });
              record[f.key] = null;
            }
          }
        });

        // Sexo is mandatory. Normalize incoming values to canonical Masculino/Femenino
        // and reject the row if it's missing or unrecognizable.
        if (tableName === 'contacts') {
          const rawSexo = String(record.sexo || '').trim().toLowerCase();
          if (!rawSexo) {
            validationErrors.push({ row: idx + 1, field: 'Sexo', value: '', message: 'Sexo es obligatorio (Masculino o Femenino).' });
          } else if (['masculino', 'hombre', 'varon', 'varón', 'm', 'male'].includes(rawSexo)) {
            record.sexo = 'Masculino';
          } else if (['femenino', 'mujer', 'f', 'female'].includes(rawSexo)) {
            record.sexo = 'Femenino';
          } else {
            validationErrors.push({ row: idx + 1, field: 'Sexo', value: String(record.sexo), message: 'Sexo no reconocido. Usar Masculino o Femenino.' });
          }
        }
      });

      if (validationErrors.length > 0) {
        setImportErrors(validationErrors);
      }

      // Rows with fatal Sexo errors must not be inserted (sexo is mandatory).
      // Build a set of row indexes (0-based) that have a Sexo validation error.
      const fatalRowIdxs = new Set(
        validationErrors.filter(v => v.field === 'Sexo').map(v => v.row - 1)
      );

      // Insert records individually to track exactly which ones fail
      const failed: {row: number, data: Record<string, string>}[] = [];
      const importedIds: string[] = [];
      // Snapshot of the original CSV row data for every successful insert,
      // so we can persist it on the import log for later forensic viewing.
      // Without this, when a trigger or migration later changes the
      // contact's columns (e.g. the cuerda alignment migration moved
      // Micaela's contacts from 104 → 204), Historial only sees the
      // current value and the user can't tell what the file actually
      // said. The snapshot answers "what came in" independently.
      const importedRows: Array<{ row: number; data: Record<string, any> }> = [];
      let successCount = 0;
      
      for (let i = 0; i < recordsToInsert.length; i++) {
        if (fatalRowIdxs.has(i)) {
          failed.push({ row: i + 1, data: dataToImport[i] as Record<string, string> });
          continue;
        }
        const { data: inserted, error } = await supabase.from(tableName).insert(recordsToInsert[i]).select().single();
        if (error) {
          // Generic insert error path. The duplicate_phone trigger that
          // used to reject same-phone rows was dropped — duplicates are
          // surfaced as a non-blocking flag in the Semillero now, not as
          // a rejection at insert time.
          const colMatch = error.message.match(/syntax for type [^:]+: "([^"]+)"/);
          setImportErrors(prev => [...prev, {
            row: i + 1,
            field: 'Error de inserción',
            value: colMatch ? colMatch[1] : '',
            message: error.message,
          }]);
          failed.push({ row: i + 1, data: dataToImport[i] as Record<string, string> });
          await logEvent({ action: 'csv_import', error, payload: { row: i + 1, church_id: churchId }, context: { church_id: churchId } });
        } else {
          successCount++;
          if (inserted) {
            importedIds.push(inserted.id);
            // Capture both the original CSV row (dataToImport[i]) and the
            // contact's id so the Historial view can hard-link rather
            // than reconstruct via time-window heuristics. Storing the
            // full row keeps "what the file said" pinned permanently —
            // even if every column on the contact gets edited later, the
            // import log still shows the original.
            importedRows.push({
              row: i + 1,
              data: { id: inserted.id, ...dataToImport[i] },
            });
          }
          // Log every successful import to activity_logs so it appears in Historial.
          // Without this, bulk-imported contacts were invisible in the historial view
          // even though they existed in the contacts table.
          if (inserted && tableName === 'contacts' && churchId) {
            await supabase.from('activity_logs').insert({
              user_id: session?.user?.id,
              church_id: churchId,
              action: 'create',
              entity_type: 'contact',
              entity_id: inserted.id,
              before_data: null,
              after_data: { ...inserted, _source: 'csv_import' },
            });
          }
        }
      }
      
      if (failed.length > 0) {
        setFailedContacts(failed);
      }

      // Persist the session so users (and supervisors) can see what happened
      // later. Without this, anyone who closes the dialog loses the failure
      // list — exactly what bit Micaela when ~200 of her rows were rejected.
      // We zip the failed array with importErrors (collected per row earlier)
      // to get the message alongside the raw row data.
      try {
        const errorByRow = new Map(importErrors.map(e => [e.row, e.message]));
        const failuresPayload = failed.map(f => ({
          row: f.row,
          data: f.data,
          message: errorByRow.get(f.row) || 'Error de inserción',
        }));
        await supabase.from('csv_import_logs').insert({
          user_id: session?.user?.id,
          church_id: churchId || null,
          entity_type: tableName === 'contacts' ? 'contact' : tableName,
          filename: file?.name || null,
          total_rows: recordsToInsert.length,
          success_count: successCount,
          failure_count: failed.length,
          failures: failuresPayload,
          // Store the original CSV row data for every successful insert,
          // pinned to the contact's id so we can render the historical
          // view independent of whatever happens to the contact later.
          // This is what lets Historial answer "what did the file say?"
          // versus "what does the contact look like now?".
          imported_rows: importedRows,
        });
      } catch (e) {
        // Logging the import shouldn't fail the import itself — best effort.
        console.error('[CsvImporter] failed to persist import log', e);
      }

      if (successCount === 0 && failed.length > 0) {
        throw new Error(`No se pudo importar ningún contacto. ${failed.length} fila(s) con errores.`);
      }

      showSuccess(`¡Importación completada! ${successCount} contactos importados${failed.length > 0 ? ` (${failed.length} con errores)` : ''}.`);
      setImportSuccess(true);
      setFile(null);
      setCsvHeaders([]);
      setDataToImport([]);
      setColumnMapping({});
      setAutoMatchedFields(new Set());
      // Refresh Semillero contacts list immediately so user sees new data without F5
      if (churchId) {
        queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
      }
      // Notify parent: close dialog + highlight imported rows
      if (onImportComplete) {
        onImportComplete(importedIds);
      }
    } catch (error: any) {
      console.error('[CsvImporter] Error during import:', error);
      showError(error.message || 'Error desconocido al importar datos.');
    } finally {
      dismissToast(toastId as string); // Cast toastId to string
      setLoading(false);
    }
  };

  return (
    <>
    <Card className="w-full border-0 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-6 w-6" />
          Importar CSV a {tableName.charAt(0).toUpperCase() + tableName.slice(1)}
        </CardTitle>
        <CardDescription>
          Sube un archivo CSV, mapea las columnas y importa los datos a la tabla de {tableName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Archivo CSV</Label>
          <div className="flex items-center gap-4">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Seleccionar archivo
            </Button>
            <div
              className="flex-1 border-2 border-dashed rounded p-4 text-center text-sm text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              Arrastrar el archivo CSV o Excel acá
            </div>
          </div>
          <Input
            ref={fileInputRef}
            id="csv-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
            className="hidden"
          />
          {file && <p className="text-sm text-muted-foreground">Archivo seleccionado: {file.name}</p>}
          {importSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1 mt-2">
              <CheckCircle2 className="h-4 w-4" />
              Importación completada{failedContacts.length > 0 ? ` — ${failedContacts.length} contacto(s) no pudieron importarse (ver abajo)` : ' con éxito'}.
            </p>
          )}
          {importErrors.length > 0 && (
            <div className="mt-3 border border-yellow-500 rounded-md overflow-hidden">
              <div className="bg-yellow-500/10 px-3 py-2 flex items-center gap-2 text-yellow-600 font-medium text-sm">
                <span>⚠️</span>
                <span>{importErrors.length} fila(s) con advertencias de formato — el campo fue importado como vacío</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Fila</th>
                      <th className="text-left px-3 py-1.5 font-medium">Campo</th>
                      <th className="text-left px-3 py-1.5 font-medium">Valor recibido</th>
                      <th className="text-left px-3 py-1.5 font-medium">Problema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importErrors.map((err, i) => (
                      <tr key={i} className="hover:bg-muted/50">
                        <td className="px-3 py-1.5 font-mono">{err.row}</td>
                        <td className="px-3 py-1.5 font-medium">{err.field}</td>
                        <td className="px-3 py-1.5 font-mono text-red-500">{err.value || '(vacío)'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {failedContacts.length > 0 && (
            <div className="mt-3 border border-red-500 rounded-md overflow-hidden">
              <div className="bg-red-500/10 px-3 py-2 flex items-center gap-2 text-red-600 font-medium text-sm">
                <span>❌</span>
                <span>{failedContacts.length} contacto(s) NO importados — datos originales del CSV:</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Fila</th>
                      {Object.keys(failedContacts[0]?.data || {}).slice(0, 6).map(k => (
                        <th key={k} className="text-left px-3 py-1.5 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {failedContacts.map((fc, i) => (
                      <tr key={i} className="hover:bg-red-500/5">
                        <td className="px-3 py-1.5 font-mono text-red-500">{fc.row}</td>
                        {Object.values(fc.data).slice(0, 6).map((v, j) => (
                          <td key={j} className="px-3 py-1.5">{String(v || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {csvHeaders.length > 0 && (
          <div className="space-y-4">
            <h3 className="lg:text-lg font-semibold">Mapeo de Columnas</h3>
            <p className="text-sm text-muted-foreground">
              Asigna los encabezados de tu CSV a los campos de la tabla de {tableName}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {requiredFields.map(field => {
                const isAutoMatched = autoMatchedFields.has(field.key) && !!columnMapping[field.key];
                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`map-${field.key}`} className="flex items-center gap-1.5">
                      {field.label} <span className="text-red-500">*</span>
                      {isAutoMatched && <span className="text-[10px] text-green-500 font-medium">✓ auto</span>}
                    </Label>
                    <Select
                      onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                      value={columnMapping[field.key] ?? undefined}
                      disabled={loading}
                    >
                      <SelectTrigger
                        id={`map-${field.key}`}
                        className={`w-full ${isAutoMatched ? 'border-green-500/50 ring-1 ring-green-500/20' : ''}`}
                      >
                        <SelectValue placeholder={`Selecciona columna para ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, i) => (
                          <SelectItem key={header || `empty-${i}`} value={header || `__empty_${i}__`}>
                            {header || '(columna vacía)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
              {optionalFields.map(field => {
                const isAutoMatched = autoMatchedFields.has(field.key) && !!columnMapping[field.key];
                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`map-${field.key}`} className="flex items-center gap-1.5">
                      {field.label}
                      {isAutoMatched && <span className="text-[10px] text-green-500 font-medium">✓ auto</span>}
                    </Label>
                    <Select
                      onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                      value={columnMapping[field.key] ?? '__none__'}
                      disabled={loading}
                    >
                      <SelectTrigger
                        id={`map-${field.key}`}
                        className={`w-full ${isAutoMatched ? 'border-green-500/50 ring-1 ring-green-500/20' : ''}`}
                      >
                        <SelectValue placeholder={`Selecciona columna para ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(No importar)</SelectItem>
                        {csvHeaders.map((header, i) => (
                          <SelectItem key={header || `empty-${i}`} value={header || `__empty_${i}__`}>
                            {header || '(columna vacía)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          type="button"
          onClick={handleImportData}
          disabled={loading || !file || requiredMissing.length > 0}
        >
          {loading ? 'Importando...' : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Importar Datos
            </>
          )}
        </Button>
      </CardFooter>
    </Card>

    {/* Cuerda mismatch confirmation. Shown only when the importer is a
        non-global with a cuerda assigned, the CSV had cuerda values that
        differ from theirs, and we haven't already gotten consent for
        this run. The 'Importar a mi cuerda' button rewrites every cuerda
        cell in dataToImport before the actual import runs, so the
        snapshot we'll persist on the import log shows the user's cuerda
        (matching what actually lands in the contacts table). */}
    <Dialog open={!!cuerdaConfirm} onOpenChange={(o) => { if (!o) setCuerdaConfirm(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cuerdas distintas a la tuya
          </DialogTitle>
          <DialogDescription className="text-left space-y-2 pt-2">
            {cuerdaConfirm && (
              <>
                <span className="block">
                  Estás por importar contactos cuya columna <strong>Cuerda</strong> tiene valores distintos al tuyo.
                </span>
                <span className="block text-xs text-muted-foreground">
                  Tu cuerda: <strong className="text-foreground tabular-nums">{cuerdaConfirm.userCuerda}</strong>
                  {' · '}
                  En el archivo aparece: <strong className="text-foreground tabular-nums">{cuerdaConfirm.distinctMismatched.join(', ')}</strong>
                  {' · '}
                  Filas afectadas: <strong className="text-foreground tabular-nums">{cuerdaConfirm.mismatchedRowCount}</strong>
                </span>
                <span className="block pt-1">
                  Si los cargás tal cual el archivo, <strong>no vas a poder verlos en tu semillero</strong> porque tu sesión solo muestra contactos de tu cuerda.
                </span>
                <span className="block">
                  ¿Querés que los importemos a tu cuerda <strong className="text-foreground">{cuerdaConfirm.userCuerda}</strong> para que aparezcan en tu semillero?
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setCuerdaConfirm(null)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              // Confirm: set the sticky flag, close the dialog, and re-fire
              // the import. The flag tells the next handleImportData call
              // to skip the check and rewrite cuerda values to the user's.
              setCuerdaConfirmedAction('rewrite');
              setCuerdaConfirm(null);
              // Defer one tick so the state update lands before we re-call.
              setTimeout(() => handleImportData(), 0);
            }}
          >
            Importar a mi cuerda{cuerdaConfirm ? ` ${cuerdaConfirm.userCuerda}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default CsvImporter;