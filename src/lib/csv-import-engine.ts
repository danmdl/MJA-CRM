// Shared CSV import engine. Used by both the live importer (writes to DB)
// and the sandbox (validates + previews, never writes). Keeping the
// transform/validation logic here means changes to one path benefit the
// other automatically — no risk of the sandbox passing a row that
// production would reject (or vice versa).
//
// NOTE: as of the first sandbox commit, the live CsvImporter still has its
// own inline copy of the transform/validate code. This module was extracted
// from there verbatim. Migrating CsvImporter to call dryRunImport() and
// then doing inserts on the rows that pass is a follow-up — kept out of the
// sandbox PR to avoid touching the live importer in the same change.

import { ContactField } from './contact-fields';
import { isValidArgentinePhone } from './phone-validation';

export interface DryRunRow {
  rowNumber: number;
  raw: Record<string, string>;
  transformed: Record<string, any> | null;
  validationErrors: { field: string; value: string; message: string }[];
  willBeRejected: boolean;
}

export interface DryRunResult {
  rows: DryRunRow[];
  totalCount: number;
  validCount: number;
  invalidCount: number;
  duplicatePhoneCount: number;
  /**
   * Aggregated by error message for the summary view. e.g.:
   *   { "Sexo es obligatorio": 5, "Teléfono duplicado: ...": 12 }
   */
  errorSummary: Record<string, number>;
}

interface DryRunOptions {
  data: Record<string, string>[];
  columnMapping: Record<string, string | null>;
  allTargetFields: ContactField[];
  tableName: string;
  defaultCuerda: string | null;          // user's own cuerda for fallback
  existingPhonesNormalized: Set<string>; // alive contacts in this church (normalized)
  duplicatePhonesInFile: Map<string, number[]>; // normalized → [row indexes] for in-file duplicates
}

const BLOCKED_FIELDS = new Set(['created_at', 'id', 'church_id', 'created_by']);
const DATE_FIELDS = new Set(['fecha_contacto', 'date_of_birth', 'created_at']);
const NUMBER_FIELDS = new Set(['edad']);

const sanitizeValue = (key: string, val: string): any => {
  if (val === '' || val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  // Any value with no letters or digits is junk (e.g. ".", ", ,", ". .", "-",
  // mixed whitespace + punctuation). Earlier we only caught a fixed set of
  // characters and missed inputs that combined spaces with dots/commas, so the
  // address column ended up storing ". ," and the "sin dirección" filter
  // counted those rows as having an address.
  if (!/[\p{L}\p{N}]/u.test(trimmed) || trimmed === 'N/A' || trimmed === 'n/a') return null;
  // Address-specific rule: if the part before the first comma has no
  // letters or digits (e.g. ", Villa Maipu" or ". , Caseros"), the
  // value is a barrio masquerading as an address. The street part is
  // what makes an address an address; without it we'd render leading
  // junk in the UI. NULL it out — the barrio column handles the rest.
  if (key === 'address' && trimmed.includes(',')) {
    const streetPart = trimmed.split(',')[0].trim();
    if (!/[\p{L}\p{N}]/u.test(streetPart)) return null;
  }

  if (DATE_FIELDS.has(key)) {
    const dateOnly = trimmed.split(' ')[0];
    const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{2})$/;
    if (!dateRegex.test(dateOnly)) return null;
    const d = new Date(dateOnly);
    return isNaN(d.getTime()) ? null : dateOnly;
  }

  if (NUMBER_FIELDS.has(key)) {
    const match = trimmed.match(/^(\d+)/);
    if (!match) return null;
    const n = parseInt(match[1]);
    return isNaN(n) ? null : n;
  }

  return trimmed;
};

/**
 * Normalize a phone for duplicate detection. Mirrors the DB trigger logic
 * (digits only). Same shape used to build the `existingPhonesNormalized`
 * set the caller passes in.
 */
export const normalizePhoneForDedupe = (phone: string | null | undefined): string => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
};

/**
 * Run the same transformation + validation pipeline production uses,
 * WITHOUT touching the database. Returns a per-row breakdown that the UI
 * can render as a preview table or summary.
 */
export const dryRunImport = ({
  data,
  columnMapping,
  allTargetFields,
  tableName,
  defaultCuerda,
  existingPhonesNormalized,
  duplicatePhonesInFile,
}: DryRunOptions): DryRunResult => {
  const rows: DryRunRow[] = [];
  const errorSummary: Record<string, number> = {};
  let validCount = 0;
  let invalidCount = 0;
  let duplicatePhoneCount = 0;

  data.forEach((rawRow, idx) => {
    const transformed: Record<string, any> = {};
    allTargetFields.forEach(targetField => {
      if (BLOCKED_FIELDS.has(targetField.key)) return;
      const csvHeader = columnMapping[targetField.key];
      if (csvHeader && rawRow[csvHeader] !== undefined) {
        transformed[targetField.key] = sanitizeValue(targetField.key, rawRow[csvHeader]);
      }
    });
    if (!transformed.numero_cuerda && defaultCuerda) {
      transformed.numero_cuerda = defaultCuerda;
    }

    const validationErrors: { field: string; value: string; message: string }[] = [];

    // Date format check (reuses sanitizeValue's regex but reports raw input)
    allTargetFields.forEach(f => {
      if (DATE_FIELDS.has(f.key) && transformed[f.key] !== null && transformed[f.key] !== undefined) {
        const raw = rawRow[columnMapping[f.key] || ''] || '';
        const dateOnly = String(raw).trim().split(' ')[0];
        const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{2})$/;
        if (raw && !dateRegex.test(dateOnly)) {
          validationErrors.push({ field: f.label, value: String(raw), message: 'Formato de fecha inválido (use AAAA-MM-DD)' });
        }
      }
    });

    // Sexo is mandatory for contact imports — same rule as production.
    if (tableName === 'contacts') {
      const rawSexo = String(transformed.sexo || '').trim().toLowerCase();
      if (!rawSexo) {
        validationErrors.push({ field: 'Sexo', value: '', message: 'Sexo es obligatorio (Masculino o Femenino).' });
      } else if (['masculino', 'hombre', 'varon', 'varón', 'm', 'male'].includes(rawSexo)) {
        transformed.sexo = 'Masculino';
      } else if (['femenino', 'mujer', 'f', 'female'].includes(rawSexo)) {
        transformed.sexo = 'Femenino';
      } else {
        validationErrors.push({ field: 'Sexo', value: String(transformed.sexo), message: 'Sexo no reconocido. Usar Masculino o Femenino.' });
      }
    }

    // Phone duplicate checks — both vs existing DB rows AND vs other rows in
    // the same file. Production no longer rejects either case (the DB
    // trigger was dropped, the live importer accepts everything), so the
    // sandbox shouldn't either. Both surface as non-fatal advertencias so
    // the user can see them in the preview but the row count under
    // "Importarían" matches what production would actually insert.
    if (tableName === 'contacts' && transformed.phone) {
      const normalized = normalizePhoneForDedupe(transformed.phone);
      if (normalized.length >= 8) {
        if (existingPhonesNormalized.has(normalized)) {
          validationErrors.push({ field: 'Teléfono', value: String(transformed.phone), message: 'Teléfono compartido con un contacto existente en esta iglesia (advertencia).' });
        } else {
          const duplicateRowIdxs = duplicatePhonesInFile.get(normalized) || [];
          if (duplicateRowIdxs.length > 1 && duplicateRowIdxs[0] !== idx) {
            const firstRow = duplicateRowIdxs[0] + 1;
            validationErrors.push({ field: 'Teléfono', value: String(transformed.phone), message: `Teléfono duplicado en el archivo (también en fila ${firstRow}) (advertencia).` });
          }
        }
      }
    }

    // Phone format warning — non-fatal, but worth surfacing so the user knows
    // they'll have a half-broken WhatsApp link in production.
    if (tableName === 'contacts' && transformed.phone) {
      const ok = isValidArgentinePhone(String(transformed.phone));
      if (!ok) {
        validationErrors.push({ field: 'Teléfono', value: String(transformed.phone), message: 'Formato de teléfono argentino inválido (advertencia).' });
      }
    }

    // A row is rejected if it has a fatal validation error. The phone-format
    // warning isn't fatal — production would still insert it.
    const fatalMessages = validationErrors.filter(e => !e.message.includes('(advertencia)'));
    const willBeRejected = fatalMessages.length > 0;

    fatalMessages.forEach(e => {
      errorSummary[e.message] = (errorSummary[e.message] || 0) + 1;
    });

    if (willBeRejected) {
      invalidCount++;
      if (fatalMessages.some(m => m.field === 'Teléfono')) duplicatePhoneCount++;
    } else {
      validCount++;
    }

    rows.push({
      rowNumber: idx + 1,
      raw: rawRow,
      transformed: willBeRejected ? null : transformed,
      validationErrors,
      willBeRejected,
    });
  });

  return {
    rows,
    totalCount: data.length,
    validCount,
    invalidCount,
    duplicatePhoneCount,
    errorSummary,
  };
};

/**
 * Build the in-file duplicates map: normalized phone → [0-based row indexes
 * where it appears]. Helpers for the dryRunImport caller.
 */
export const buildDuplicatePhonesMap = (
  data: Record<string, string>[],
  phoneCsvHeader: string | null,
): Map<string, number[]> => {
  const m = new Map<string, number[]>();
  if (!phoneCsvHeader) return m;
  data.forEach((row, idx) => {
    const phone = row[phoneCsvHeader] || '';
    const normalized = normalizePhoneForDedupe(phone);
    if (normalized.length < 8) return;
    const arr = m.get(normalized) || [];
    arr.push(idx);
    m.set(normalized, arr);
  });
  return m;
};
