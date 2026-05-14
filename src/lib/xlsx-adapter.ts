// Thin adapter over ExcelJS so the rest of the app speaks "rows of
// objects" instead of SheetJS / ExcelJS workbook details. We migrated
// off `xlsx` (SheetJS Community Edition) because it's unmaintained
// and has open CVEs (prototype pollution CVE-2024-22363, etc).
//
// ExcelJS is heavier than xlsx-CE, but every call site that uses this
// adapter is already lazy-loaded — these only ship for users who
// actually pick a .xlsx file or click "Export Excel".

import ExcelJS from 'exceljs';

/**
 * Parse an .xlsx file (ArrayBuffer) into rows-of-objects, keyed by
 * the first-row header. Mirrors the shape SheetJS's
 * `sheet_to_json({ defval: '' })` returned — missing cells become ''
 * so downstream code can do `row.foo || 'fallback'` without crashing.
 */
export const readXlsx = async (buffer: ArrayBuffer): Promise<Record<string, string>[]> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // Row 1 is the header. ExcelJS rows are 1-indexed; .values is a
  // 1-indexed sparse array (index 0 is undefined), so we strip it.
  const headerRow = ws.getRow(1).values as (string | undefined)[];
  const headers: string[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    headers.push(headerRow[i] != null ? String(headerRow[i]).trim() : '');
  }

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const out: Record<string, string> = {};
    const vals = row.values as unknown[];
    headers.forEach((h, idx) => {
      // Skip blank header columns — same as SheetJS's behavior with
      // an empty header cell.
      if (!h) return;
      const raw = vals[idx + 1];
      out[h] = formatCell(raw);
    });
    rows.push(out);
  });
  return rows;
};

/**
 * Write a 2D matrix (rows of values, first row = headers) to an
 * .xlsx file and trigger a download in the browser. Replaces
 * SheetJS's `XLSX.writeFile`.
 */
export const writeXlsxFromAOA = async (
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Sheet1',
): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31)); // Excel cap
  ws.addRows(rows);

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(buf, filename);
};

/**
 * Write rows-of-objects to an .xlsx file with explicit column order.
 * Replaces SheetJS's `XLSX.utils.json_to_sheet({ header })`.
 */
export const writeXlsxFromRows = async (
  rows: Record<string, unknown>[],
  headers: string[],
  filename: string,
  sheetName = 'Sheet1',
): Promise<void> => {
  const aoa: (string | number | null | undefined)[][] = [headers];
  for (const r of rows) {
    aoa.push(headers.map(h => {
      const v = r[h];
      if (v == null) return '';
      if (typeof v === 'number') return v;
      return String(v);
    }));
  }
  await writeXlsxFromAOA(aoa, filename, sheetName);
};

const formatCell = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) {
    // Match SheetJS's `raw:false` behavior for dates — ISO date only,
    // no timezone-shifted timestamp.
    return v.toISOString().slice(0, 10);
  }
  // ExcelJS returns rich-text / hyperlink / formula cells as objects.
  // Fall back to the plain `.result` / `.text` when present, else
  // stringify so callers always get a string.
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === 'string') return o.text;
    if (Array.isArray(o.richText)) return o.richText.map(p => p.text).join('');
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
};

const triggerDownload = (buf: ArrayBuffer, filename: string): void => {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
