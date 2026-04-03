"use client";

import React, { useState, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { logEvent } from '@/utils/clientLogger';
import { ContactField } from '@/lib/contact-fields'; // Import ContactField type
import { Checkbox } from '@/components/ui/checkbox';
import { useQueryClient } from '@tanstack/react-query';

interface CsvImporterProps {
  tableName: string;
  requiredFields: ContactField[]; // Updated type to ContactField[]
  optionalFields: ContactField[]; // Updated type to ContactField[]
  churchId?: string; // Add optional churchId prop
}

const CsvImporter = ({ tableName, requiredFields, optionalFields, churchId }: CsvImporterProps) => {
  const { session, profile } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [dataToImport, setDataToImport] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importErrors, setImportErrors] = useState<{row: number, field: string, value: string, message: string}[]>([]);
  const [failedContacts, setFailedContacts] = useState<{row: number, data: Record<string, string>}[]>([]);
  const [ignoreMap, setIgnoreMap] = useState<Record<string, boolean>>({});
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
    setIgnoreMap({});

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

  // Shared logic for both CSV and XLSX after parsing headers + data
  const processHeaders = (headers: string[], data: Record<string, string>[]) => {
    setCsvHeaders(headers);
    const initialMapping: Record<string, string | null> = {};
    allTargetFields.forEach(targetField => {
      const matchingCsvHeader = headers.find(csvHeader =>
        csvHeader.toLowerCase().includes(targetField.label.toLowerCase().replace(/\s/g, '_')) ||
        csvHeader.toLowerCase().includes(targetField.key.toLowerCase())
      );
      initialMapping[targetField.key] = matchingCsvHeader || null;
    });
    setColumnMapping(initialMapping);
    setDataToImport(data);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  };

  const handleColumnMappingChange = (targetFieldKey: string, csvHeader: string) => {
    setColumnMapping(prev => ({ ...prev, [targetFieldKey]: csvHeader === '__none__' ? null : csvHeader }));
  };

  const toggleIgnore = (targetFieldKey: string, ignore: boolean) => {
    setIgnoreMap(prev => ({ ...prev, [targetFieldKey]: ignore }));
    if (ignore) {
      setColumnMapping(prev => ({ ...prev, [targetFieldKey]: null }));
    }
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

    setLoading(true);
    const toastId = showLoading('Importando datos...');

    try {
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
          if (ignoreMap[targetField.key]) return; // Skip ignored fields
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
      });

      if (validationErrors.length > 0) {
        setImportErrors(validationErrors);
      }

      // Insert records individually to track exactly which ones fail
      const failed: {row: number, data: Record<string, string>}[] = [];
      let successCount = 0;
      
      for (let i = 0; i < recordsToInsert.length; i++) {
        const { error } = await supabase.from(tableName).insert(recordsToInsert[i]);
        if (error) {
          const colMatch = error.message.match(/syntax for type [^:]+: "([^"]+)"/);
          const valMatch = colMatch ? colMatch[1] : '';
          setImportErrors(prev => [...prev, { 
            row: i + 1, 
            field: 'Error de inserción', 
            value: valMatch, 
            message: error.message 
          }]);
          // Store the original CSV row data for display
          failed.push({ row: i + 1, data: dataToImport[i] as Record<string, string> });
          await logEvent({ action: 'csv_import', error, payload: { row: i + 1, church_id: churchId }, context: { church_id: churchId } });
        } else {
          successCount++;
        }
      }
      
      if (failed.length > 0) {
        setFailedContacts(failed);
      }
      
      if (successCount === 0 && failed.length > 0) {
        throw new Error(`No se pudo importar ningún contacto. ${failed.length} fila(s) con errores.`);
      }

      showSuccess(`¡Importación completada! ${recordsToInsert.length - (failedContacts.length || 0)} contactos importados.`);
      setImportSuccess(true);
      setFile(null);
      setCsvHeaders([]);
      setDataToImport([]);
      setColumnMapping({});
      // NEW: refresh contacts list immediately
      if (churchId) {
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
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
              {requiredFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label} <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                    value={columnMapping[field.key] ?? undefined}
                    disabled={loading}
                  >
                    <SelectTrigger id={`map-${field.key}`} className="w-full">
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
              ))}
              {optionalFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`map-${field.key}`}>{field.label}</Label>
                  <div className="flex items-center gap-3">
                    <Select
                      onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                      value={ignoreMap[field.key] ? '__none__' : (columnMapping[field.key] ?? '__none__')}
                      disabled={loading || !!ignoreMap[field.key]}
                    >
                      <SelectTrigger id={`map-${field.key}`} className="w-full">
                        <SelectValue placeholder={`Selecciona columna para ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(Opcional)</SelectItem>
                        {csvHeaders.map((header, i) => (
                          <SelectItem key={header || `empty-${i}`} value={header || `__empty_${i}__`}>
                            {header || '(columna vacía)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!ignoreMap[field.key]}
                        onCheckedChange={(val) => toggleIgnore(field.key, !!val)}
                      />
                      <span>No agregar</span>
                    </label>
                  </div>
                </div>
              ))}
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
  );
};

export default CsvImporter;