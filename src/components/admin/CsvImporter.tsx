"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle2, XCircle } from 'lucide-react';
import Papa from 'papaparse';
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
import { ContactField } from '@/lib/contact-fields'; // Import ContactField type
import { Checkbox } from '@/components/ui/checkbox';

interface CsvImporterProps {
  tableName: string;
  requiredFields: ContactField[]; // Updated type to ContactField[]
  optionalFields: ContactField[]; // Updated type to ContactField[]
  churchId?: string; // Add optional churchId prop
}

const CsvImporter = ({ tableName, requiredFields, optionalFields, churchId }: CsvImporterProps) => {
  const { session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [dataToImport, setDataToImport] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [ignoreMap, setIgnoreMap] = useState<Record<string, boolean>>({});

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
    console.log("[CsvImporter] handleFileChange triggered.");
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImportSuccess(false);
      setColumnMapping({});
      setIgnoreMap({});

      // Parse entire file to get headers and full data
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (results.meta.fields) {
            setCsvHeaders(results.meta.fields);
            // Attempt to auto-map common headers
            const initialMapping: Record<string, string | null> = {};
            allTargetFields.forEach(targetField => {
              const matchingCsvHeader = results.meta.fields?.find(csvHeader =>
                csvHeader.toLowerCase().includes(targetField.label.toLowerCase().replace(/\s/g, '_')) ||
                csvHeader.toLowerCase().includes(targetField.key.toLowerCase())
              );
              initialMapping[targetField.key] = matchingCsvHeader || null;
            });
            setColumnMapping(initialMapping);
            setDataToImport(results.data as Record<string, string>[]);
          } else {
            setCsvHeaders([]);
            setDataToImport([]);
          }
        },
        error: (error) => {
          console.error("Error parsing CSV:", error);
          showError("Error al leer el archivo CSV.");
          setCsvHeaders([]);
          setDataToImport([]);
        }
      });
    }
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
    console.log("[CsvImporter] handleImportData triggered.");
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
      const recordsToInsert = dataToImport.map(row => {
        const newRecord: Record<string, any> = {};
        allTargetFields.forEach(targetField => {
          if (ignoreMap[targetField.key]) return; // Skip ignored fields
          const csvHeader = columnMapping[targetField.key];
          if (csvHeader && row[csvHeader] !== undefined) {
            newRecord[targetField.key] = row[csvHeader];
          }
        });
        if (churchId) {
          newRecord.church_id = churchId; // Add churchId to each record if provided
        }
        return newRecord;
      });

      // Insert in batches to avoid hitting limits for large files
      const batchSize = 1000;
      for (let i = 0; i < recordsToInsert.length; i += batchSize) {
        const batch = recordsToInsert.slice(i, i + batchSize);
        console.log(`[CsvImporter] Inserting batch ${i / batchSize + 1} of ${Math.ceil(recordsToInsert.length / batchSize)}`);
        const { error } = await supabase.from(tableName).insert(batch);

        if (error) {
          console.error('[CsvImporter] Error inserting batch:', error);
          throw new Error(`Error al insertar datos: ${error.message}`);
        }
      }

      showSuccess('¡Datos importados con éxito!');
      setImportSuccess(true);
      setFile(null);
      setCsvHeaders([]);
      setDataToImport([]);
      setColumnMapping({});
    } catch (error: any) {
      console.error('[CsvImporter] Error during import:', error);
      showError(error.message || 'Error desconocido al importar datos.');
    } finally {
      dismissToast(toastId as string); // Cast toastId to string
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
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
          <Label htmlFor="csv-file">Archivo CSV</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={loading}
          />
          {file && <p className="text-sm text-muted-foreground">Archivo seleccionado: {file.name}</p>}
          {importSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Importación completada.
            </p>
          )}
        </div>

        {csvHeaders.length > 0 && (
          <div className="space-y-4">
            <h3 className="lg:text-lg font-semibold">Mapeo de Columnas</h3>
            <p className="text-sm text-muted-foreground">
              Asigna los encabezados de tu CSV a los campos de la tabla de {tableName}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requiredFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label} <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <Select
                      onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                      value={ignoreMap[field.key] ? undefined : (columnMapping[field.key] ?? undefined)}
                      disabled={loading || !!ignoreMap[field.key]}
                    >
                      <SelectTrigger id={`map-${field.key}`} className="min-w-[280px]">
                        <SelectValue placeholder={`Selecciona columna para ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={!!ignoreMap[field.key]}
                        onCheckedChange={(val) => toggleIgnore(field.key, !!val)}
                        disabled
                      />
                      <span>No agregar (requerido)</span>
                    </label>
                  </div>
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
                      <SelectTrigger id={`map-${field.key}`} className="min-w-[280px]">
                        <SelectValue placeholder={`Selecciona columna para ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(Opcional)</SelectItem>
                        {csvHeaders.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
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