"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileText, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { showSuccess, showError } from '@/utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CsvDeduplicatorPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processedData, setProcessedData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [emailColumn, setEmailColumn] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('processed_data.csv');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setOriginalFileName(selectedFile.name.replace(/\.csv$/, '_deduplicated.csv'));
      setProcessedData(null); // Reset processed data
      setEmailColumn(null); // Reset selected column

      // Read headers to populate the select dropdown
      Papa.parse(selectedFile, {
        header: true,
        preview: 1, // Only parse the first row to get headers
        complete: (results) => {
          if (results.meta.fields) {
            setHeaders(results.meta.fields);
          } else {
            setHeaders([]);
          }
        },
        error: (error) => {
          console.error("Error parsing headers:", error);
          showError("Error al leer los encabezados del archivo.");
          setHeaders([]);
        }
      });
    }
  };

  const handleProcessCsv = () => {
    if (!file) {
      showError('Por favor, selecciona un archivo CSV primero.');
      return;
    }
    if (!emailColumn) {
      showError('Por favor, selecciona la columna de correo electrónico.');
      return;
    }

    setLoading(true);
    setProcessedData(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        const uniqueEmails = new Set<string>();
        const deduplicatedData: Record<string, string>[] = [];

        for (const row of data) {
          const email = row[emailColumn];
          if (email && !uniqueEmails.has(email)) {
            uniqueEmails.add(email);
            deduplicatedData.push(row);
          }
        }

        const csv = Papa.unparse(deduplicatedData);
        setProcessedData(csv);
        showSuccess('CSV procesado con éxito. ¡Filas duplicadas eliminadas!');
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
    if (processedData) {
      const blob = new Blob([processedData], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', originalFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Deduplicador de CSV</h1>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Eliminar Duplicados de CSV
          </CardTitle>
          <CardDescription>
            Sube un archivo CSV, selecciona la columna de correo electrónico y elimina las filas duplicadas.
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
            {file && <p className="text-sm text-muted-foreground">Archivo seleccionado: {file.name}</p>}
          </div>

          {headers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="email-column">Columna de Correo Electrónico</Label>
              <Select onValueChange={setEmailColumn} value={emailColumn || ''} disabled={loading}>
                <SelectTrigger id="email-column">
                  <SelectValue placeholder="Selecciona la columna de email" />
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
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button onClick={handleProcessCsv} disabled={loading || !file || !emailColumn}>
            {loading ? 'Procesando...' : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Procesar CSV
              </>
            )}
          </Button>
          {processedData && (
            <Button onClick={handleDownload} disabled={loading} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Descargar CSV
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default CsvDeduplicatorPage;