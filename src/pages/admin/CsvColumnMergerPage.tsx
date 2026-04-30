"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Columns3, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { showSuccess, showError } from '@/utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SEPARATOR = ', '; // Coma + espacio. Decisión confirmada por Dan.
const PREVIEW_ROWS = 3;

const CsvColumnMergerPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [colA, setColA] = useState<string | null>(null);
  const [colB, setColB] = useState<string | null>(null);
  const [newColName, setNewColName] = useState<string>('');
  const [newColTouched, setNewColTouched] = useState(false);
  const [processedData, setProcessedData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [outputFileName, setOutputFileName] = useState<string>('merged.csv');

  // Auto-suggest new column name when user picks both columns (only if they
  // haven't customized it yet)
  React.useEffect(() => {
    if (!newColTouched && colA && colB) {
      setNewColName(`${colA} + ${colB}`);
    }
  }, [colA, colB, newColTouched]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setOutputFileName(selectedFile.name.replace(/\.csv$/i, '_merged.csv'));
    setProcessedData(null);
    setColA(null);
    setColB(null);
    setNewColName('');
    setNewColTouched(false);
    setHeaders([]);
    setPreviewRows([]);

    // Read headers + a few preview rows
    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      preview: PREVIEW_ROWS + 1,
      complete: (results) => {
        if (results.meta.fields && results.meta.fields.length > 0) {
          setHeaders(results.meta.fields);
          setPreviewRows((results.data as Record<string, string>[]).slice(0, PREVIEW_ROWS));
        } else {
          showError('No se pudieron leer las columnas del archivo.');
          setHeaders([]);
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        showError('Error al leer el archivo CSV.');
        setHeaders([]);
      },
    });
  };

  const mergeValues = (a: string | undefined, b: string | undefined): string => {
    const partA = (a ?? '').trim();
    const partB = (b ?? '').trim();
    if (partA && partB) return `${partA}${SEPARATOR}${partB}`;
    return partA || partB; // si una está vacía, devolvemos la otra sin separador
  };

  const previewMerged = useMemo(() => {
    if (!colA || !colB || previewRows.length === 0) return [];
    return previewRows.map((row) => mergeValues(row[colA], row[colB]));
  }, [colA, colB, previewRows]);

  const handleProcessCsv = () => {
    if (!file) {
      showError('Por favor, seleccioná un archivo CSV.');
      return;
    }
    if (!colA || !colB) {
      showError('Seleccioná las dos columnas a unificar.');
      return;
    }
    if (colA === colB) {
      showError('Seleccioná dos columnas distintas.');
      return;
    }
    const finalColName = (newColName.trim() || `${colA} + ${colB}`);
    if (headers.includes(finalColName)) {
      showError(`Ya existe una columna llamada "${finalColName}". Cambiá el nombre.`);
      return;
    }

    setLoading(true);
    setProcessedData(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        const merged = data.map((row) => ({
          ...row,
          [finalColName]: mergeValues(row[colA], row[colB]),
        }));
        const csv = Papa.unparse(merged);
        setProcessedData(csv);
        showSuccess(`Listo. Se agregó la columna "${finalColName}" con ${merged.length} filas.`);
        setLoading(false);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        showError('Error al procesar el archivo CSV.');
        setLoading(false);
      },
    });
  };

  const handleDownload = () => {
    if (!processedData) return;
    const blob = new Blob([processedData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', outputFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Unificar columnas de CSV</h1>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns3 className="h-6 w-6" />
            Unir dos columnas en una
          </CardTitle>
          <CardDescription>
            Subí un CSV, elegí dos columnas (por ejemplo, calle y barrio) y se genera una nueva columna con los valores
            unificados separados por coma. Las columnas originales se mantienen.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">Archivo CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={loading}
            />
            {file && <p className="text-sm text-muted-foreground">Archivo: {file.name}</p>}
          </div>

          {headers.length > 0 && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="col-a">Columna A</Label>
                  <Select onValueChange={setColA} value={colA || ''} disabled={loading}>
                    <SelectTrigger id="col-a">
                      <SelectValue placeholder="Ej: Calle" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="col-b">Columna B</Label>
                  <Select onValueChange={setColB} value={colB || ''} disabled={loading}>
                    <SelectTrigger id="col-b">
                      <SelectValue placeholder="Ej: Barrio" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-col-name">Nombre de la columna nueva</Label>
                <Input
                  id="new-col-name"
                  type="text"
                  placeholder="Ej: Dirección completa"
                  value={newColName}
                  onChange={(e) => { setNewColName(e.target.value); setNewColTouched(true); }}
                  disabled={loading}
                />
              </div>

              {colA && colB && previewMerged.length > 0 && (
                <div className="space-y-2">
                  <Label>Vista previa</Label>
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
                    {previewMerged.map((value, i) => (
                      <div key={i} className="font-mono text-xs sm:text-sm break-all">
                        {value || <span className="text-muted-foreground italic">(vacío)</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mostrando las primeras {previewMerged.length} filas. Las celdas vacías se omiten al unir.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            onClick={handleProcessCsv}
            disabled={loading || !file || !colA || !colB || colA === colB}
            className="w-full sm:w-auto"
          >
            {loading ? 'Procesando...' : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Unificar columnas
              </>
            )}
          </Button>
          {processedData && (
            <Button onClick={handleDownload} disabled={loading} variant="outline" className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Descargar CSV
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default CsvColumnMergerPage;
