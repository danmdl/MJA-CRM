"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Columns3, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
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

type Row = Record<string, string>;
type FileKind = 'csv' | 'xlsx' | 'unknown';

const detectKind = (file: File): FileKind => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  return 'unknown';
};

const parseCsv = (file: File): Promise<{ headers: string[]; rows: Row[] }> =>
  new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields || [],
          rows: (results.data as Row[]) || [],
        });
      },
      error: (err) => reject(err),
    });
  });

const parseXlsx = async (file: File): Promise<{ headers: string[]; rows: Row[] }> => {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  // Read the header row in its original column order so the merged
  // output keeps the user's column layout.
  const headerVals = sheet.getRow(1).values as (string | undefined)[];
  const headers: string[] = [];
  for (let i = 1; i < headerVals.length; i++) {
    const v = headerVals[i];
    if (v != null && String(v).trim() !== '') headers.push(String(v));
  }

  const rows: Row[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const out: Row = {};
    headers.forEach((h, idx) => {
      const raw = values[idx + 1];
      if (raw == null) { out[h] = ''; return; }
      if (typeof raw === 'object' && raw !== null) {
        const o = raw as { text?: string; result?: unknown };
        out[h] = o.text ?? (o.result != null ? String(o.result) : '');
      } else {
        out[h] = String(raw);
      }
    });
    rows.push(out);
  });
  return { headers, rows };
};

const CsvColumnMergerPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<FileKind>('unknown');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [colA, setColA] = useState<string | null>(null);
  const [colB, setColB] = useState<string | null>(null);
  const [newColName, setNewColName] = useState<string>('');
  const [newColTouched, setNewColTouched] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [outputFileName, setOutputFileName] = useState<string>('merged.csv');

  // Auto-suggest new column name when user picks both columns (only if they
  // haven't customized it yet)
  React.useEffect(() => {
    if (!newColTouched && colA && colB) {
      setNewColName(`${colA} + ${colB}`);
    }
  }, [colA, colB, newColTouched]);

  const resetState = () => {
    setProcessedBlob(null);
    setColA(null);
    setColB(null);
    setNewColName('');
    setNewColTouched(false);
    setHeaders([]);
    setAllRows([]);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const kind = detectKind(selectedFile);
    if (kind === 'unknown') {
      showError('Formato no soportado. Subí un archivo .csv, .xlsx o .xls.');
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
    setFileKind(kind);
    const ext = kind === 'xlsx' ? '.xlsx' : '.csv';
    setOutputFileName(selectedFile.name.replace(/\.(csv|xlsx|xls)$/i, `_merged${ext}`));
    resetState();

    setLoading(true);
    try {
      const { headers: hdrs, rows } = kind === 'csv'
        ? await parseCsv(selectedFile)
        : await parseXlsx(selectedFile);
      if (hdrs.length === 0) {
        showError('No se pudieron leer las columnas del archivo.');
      } else {
        setHeaders(hdrs);
        setAllRows(rows);
      }
    } catch (err) {
      console.error('Error parsing file:', err);
      showError('Error al leer el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const mergeValues = (a: string | undefined, b: string | undefined): string => {
    const partA = (a ?? '').toString().trim();
    const partB = (b ?? '').toString().trim();
    if (partA && partB) return `${partA}${SEPARATOR}${partB}`;
    return partA || partB; // si una está vacía, devolvemos la otra sin separador
  };

  const previewMerged = useMemo(() => {
    if (!colA || !colB || allRows.length === 0) return [];
    return allRows.slice(0, PREVIEW_ROWS).map((row) => mergeValues(row[colA], row[colB]));
  }, [colA, colB, allRows]);

  const handleProcess = async () => {
    if (!file) {
      showError('Por favor, seleccioná un archivo.');
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
    setProcessedBlob(null);

    try {
      const merged = allRows.map((row) => ({
        ...row,
        [finalColName]: mergeValues(row[colA], row[colB]),
      }));

      let blob: Blob;
      if (fileKind === 'csv') {
        const csv = Papa.unparse(merged);
        blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      } else {
        // Build worksheet with explicit header order so the new column lands
        // at the end and original columns keep their original order.
        const finalHeaders = [...headers, finalColName];
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sheet1');
        ws.addRow(finalHeaders);
        for (const row of merged) {
          ws.addRow(finalHeaders.map(h => row[h] ?? ''));
        }
        const buffer = await wb.xlsx.writeBuffer();
        blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      setProcessedBlob(blob);
      showSuccess(`Listo. Se agregó la columna "${finalColName}" con ${merged.length} filas.`);
    } catch (err) {
      console.error('Error processing file:', err);
      showError('Error al procesar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!processedBlob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(processedBlob);
    link.setAttribute('download', outputFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Unificar columnas</h1>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns3 className="h-6 w-6" />
            Unir dos columnas en una
          </CardTitle>
          <CardDescription>
            Subí un archivo CSV o Excel (.xlsx), elegí dos columnas (por ejemplo, calle y barrio) y se genera una nueva
            columna con los valores unificados separados por coma. Las columnas originales se mantienen.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">Archivo (.csv, .xlsx o .xls)</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,.xlsx,.xls"
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
            onClick={handleProcess}
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
          {processedBlob && (
            <Button onClick={handleDownload} disabled={loading} variant="outline" className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Descargar {fileKind === 'xlsx' ? '.xlsx' : '.csv'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default CsvColumnMergerPage;
