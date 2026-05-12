"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, Upload, CheckCircle2, AlertCircle, Download, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

interface ImportLog {
  id: string;
  user_id: string;
  church_id: string | null;
  entity_type: string;
  filename: string | null;
  total_rows: number;
  success_count: number;
  failure_count: number;
  failures: Array<{ row: number; data: Record<string, string>; message: string }>;
  // Snapshot of the original CSV row data for every successful insert.
  // Null on rows written before this column existed (May 2026 and earlier);
  // for those, the imported-contacts view falls back to the time-window
  // reconstruction that queries the live contacts table.
  imported_rows: Array<{ row: number; data: Record<string, any> }> | null;
  created_at: string;
  user_name?: string;
}

interface ImportedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  numero_cuerda: string | null;
  fecha_contacto: string | null;
  created_at: string;
}

interface Props {
  churchId: string;
}

// Reconstructs the list of contacts that came in via a specific import log
// row. Two modes:
//
//   1. Snapshot mode (imports written after the imported_rows column was
//      added). The log row carries the exact CSV data that came in, so
//      we render that directly. This is the AUTHORITATIVE view of "what
//      the file said" — independent of any later edits, triggers, or
//      migrations that may have changed the contacts since.
//
//   2. Reconstruction mode (legacy log rows where imported_rows is null).
//      We query the live contacts table by created_by + a time window
//      around the log timestamp, ordered most-recent-first, limited to
//      success_count. This shows the CURRENT state of the contacts —
//      which may differ from the original CSV if anything edited them
//      after the import. Tagged in the UI so the user knows to read
//      it accordingly.
const ImportedContactsList = ({ log }: { log: ImportLog }) => {
  const hasSnapshot = Array.isArray(log.imported_rows) && log.imported_rows.length > 0;

  // Snapshot mode is purely client-side, no fetch needed. We still bring
  // in the live contacts when we have a snapshot, but only to show the
  // contact's CURRENT cuerda alongside the original — useful when a
  // migration or trigger has changed it (e.g. the cuerda alignment fix).
  const snapshotContactIds = hasSnapshot
    ? (log.imported_rows || []).map(r => r.data?.id).filter(Boolean) as string[]
    : [];

  const { data: liveById = new Map<string, ImportedContact>(), isLoading: liveLoading } = useQuery<Map<string, ImportedContact>>({
    queryKey: ['csv-import-live', log.id, snapshotContactIds.length],
    queryFn: async () => {
      if (snapshotContactIds.length === 0) return new Map();
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, address, numero_cuerda, fecha_contacto, created_at')
        .in('id', snapshotContactIds);
      return new Map((data || []).map((c: ImportedContact) => [c.id, c]));
    },
    enabled: hasSnapshot,
    staleTime: 60_000,
  });

  const { data: reconstructed = [], isLoading: reconstructedLoading } = useQuery<ImportedContact[]>({
    queryKey: ['csv-import-contacts', log.id],
    queryFn: async () => {
      const logTime = new Date(log.created_at).getTime();
      const windowStart = new Date(logTime - 10 * 60 * 1000).toISOString(); // -10 min
      const windowEnd   = new Date(logTime + 30 * 1000).toISOString();       // +30 sec
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, address, numero_cuerda, fecha_contacto, created_at')
        .eq('created_by', log.user_id)
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
        .order('created_at', { ascending: false })
        .limit(Math.max(log.success_count, 1));
      return (data || []).reverse() as ImportedContact[];
    },
    enabled: !hasSnapshot,
    staleTime: 60_000,
  });

  const isLoading = hasSnapshot ? liveLoading : reconstructedLoading;
  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Cargando contactos importados...</div>;
  }

  if (hasSnapshot) {
    const rows = log.imported_rows || [];
    if (rows.length === 0) {
      return <div className="text-sm text-muted-foreground py-2">Este import no tiene filas registradas.</div>;
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {rows.length} contacto{rows.length === 1 ? '' : 's'} cargado{rows.length === 1 ? '' : 's'}
          </span>
          <span className="text-[10px] text-muted-foreground italic">
            Datos del archivo original; la columna "Cuerda actual" puede diferir si fue editada.
          </span>
        </div>
        <div className="rounded border border-border/50 bg-background/50 max-h-[400px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
              <tr className="border-b border-border/50">
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-10">#</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Nombre</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Teléfono</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Dirección</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-20">Cuerda CSV</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-20">Cuerda actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = r.data || {};
                // Pull values from the CSV columns that the importer wrote
                // through to the contact. The keys here match the
                // dataToImport[i] shape in CsvImporter — original CSV
                // headers, lowercased.
                const csvName = [d.first_name || d.nombre, d.last_name || d.apellido].filter(Boolean).join(' ');
                const csvPhone = d.phone || d.telefono;
                const csvAddress = d.address || d.direccion || d.domicilio;
                const csvCuerda = d.numero_cuerda || d.cuerda;
                const live = d.id ? liveById.get(d.id) : null;
                const liveCuerda = live?.numero_cuerda;
                const cuerdaChanged = csvCuerda && liveCuerda && String(csvCuerda) !== String(liveCuerda);
                return (
                  <tr key={i} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                    <td className="px-2 py-1.5 align-top text-muted-foreground tabular-nums">{r.row}</td>
                    <td className="px-2 py-1.5 align-top">{csvName || <span className="text-muted-foreground italic">sin nombre</span>}</td>
                    <td className="px-2 py-1.5 align-top tabular-nums">{csvPhone || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-1.5 align-top">{csvAddress || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-1.5 align-top tabular-nums">{csvCuerda || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-1.5 align-top tabular-nums">
                      {liveCuerda ? (
                        <span className={cuerdaChanged ? 'text-amber-400' : ''} title={cuerdaChanged ? `Cambió de ${csvCuerda} a ${liveCuerda}` : undefined}>
                          {liveCuerda}{cuerdaChanged && <span className="ml-1">⚠</span>}
                        </span>
                      ) : live === null ? (
                        <span className="text-muted-foreground">eliminado</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Fallback for legacy logs without a snapshot.
  if (reconstructed.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        No pudimos recuperar la lista de contactos para este import.
      </div>
    );
  }
  const mismatch = reconstructed.length !== log.success_count;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {reconstructed.length} contacto{reconstructed.length === 1 ? '' : 's'} cargado{reconstructed.length === 1 ? '' : 's'}
          {mismatch && (
            <span className="text-amber-400 ml-1">
              (el log indica {log.success_count}; algunos pueden haber sido eliminados después)
            </span>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground italic">
          Estado actual de los contactos. Para imports más viejos no guardamos snapshot del archivo original.
        </span>
      </div>
      <div className="rounded border border-border/50 bg-background/50 max-h-[400px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
            <tr className="border-b border-border/50">
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-10">#</th>
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Nombre</th>
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Teléfono</th>
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Dirección</th>
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-16">Cuerda</th>
            </tr>
          </thead>
          <tbody>
            {reconstructed.map((c, i) => (
              <tr key={c.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                <td className="px-2 py-1.5 align-top text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-2 py-1.5 align-top">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || <span className="text-muted-foreground italic">sin nombre</span>}
                </td>
                <td className="px-2 py-1.5 align-top tabular-nums">{c.phone || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5 align-top">{c.address || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5 align-top tabular-nums">{c.numero_cuerda || <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// One section per import session — RLS already filters the user's view to
// either their own imports (if non-supervisor) or the whole church (if
// supervisor+). We don't need to re-apply that here.
const CsvImportLogsView = ({ churchId }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery<ImportLog[]>({
    queryKey: ['csv-import-logs', churchId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('csv_import_logs')
        .select('id, user_id, church_id, entity_type, filename, total_rows, success_count, failure_count, failures, imported_rows, created_at')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(50);
      const userIds = Array.from(new Set((rows || []).map((r: any) => r.user_id))).filter(Boolean) as string[];
      let nameById = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);
        nameById = new Map((profiles || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre']));
      }
      return (rows || []).map((r: any) => ({ ...r, user_name: nameById.get(r.user_id) || 'Usuario desconocido' }));
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  // Build a CSV string from the failed rows of a session so the user can
  // download exactly what didn't import, fix it, and re-upload. Keeps the
  // original column order from the source data.
  const downloadFailures = (log: ImportLog) => {
    if (!log.failures.length) return;
    const headers = Object.keys(log.failures[0].data || {});
    const escape = (v: string) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      [...headers, 'fila', 'motivo'].map(escape).join(','),
      ...log.failures.map(f =>
        [...headers.map(h => f.data?.[h] || ''), String(f.row), f.message].map(escape).join(',')
      ),
    ];
    const csv = '\uFEFF' + lines.join('\n');  // BOM so Excel reads UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fallidos_${log.filename || 'import'}_${log.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Cargando importaciones...</div>;
  }
  if (logs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
        Sin importaciones registradas todavía.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map(log => {
        const isOpen = expandedId === log.id;
        return (
          <div key={log.id} className="rounded-lg border border-border bg-muted/10">
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : log.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{log.filename || `Import sin nombre`}</span>
                  <span className="text-xs text-muted-foreground shrink-0">por {log.user_name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(log.created_at), "dd 'de' MMM yyyy, HH:mm", { locale: es })}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> {log.success_count}
                </span>
                {log.failure_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-400">
                    <AlertCircle className="h-3 w-3" /> {log.failure_count}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">/ {log.total_rows}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-3 border-t border-border/50 pt-3 space-y-3">
                {/* Successful contacts — always shown when there were any.
                    Previously this branch only said "Todas importadas
                    correctamente ✅" with no detail, which was useless if
                    you actually wanted to know WHAT had been imported. */}
                {log.success_count > 0 && <ImportedContactsList log={log} />}

                {log.failure_count > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {log.failure_count} fila{log.failure_count === 1 ? '' : 's'} no se pudieron importar:
                      </span>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => downloadFailures(log)}>
                        <Download className="h-3 w-3" /> Descargar CSV de fallidos
                      </Button>
                    </div>
                    <div className="rounded border border-border/50 bg-background/50 max-h-[400px] overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
                          <tr className="border-b border-border/50">
                            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-12">Fila</th>
                            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Datos</th>
                            <th className="text-left px-2 py-1.5 text-muted-foreground font-medium w-1/3">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {log.failures.map((f, i) => (
                            <tr key={i} className="border-b border-border/30 last:border-b-0">
                              <td className="px-2 py-1.5 align-top text-muted-foreground tabular-nums">{f.row}</td>
                              <td className="px-2 py-1.5 align-top">
                                {Object.entries(f.data || {}).slice(0, 4).map(([k, v]) => (
                                  <div key={k} className="truncate" title={`${k}: ${v}`}>
                                    <span className="text-muted-foreground">{k}:</span> {String(v) || '—'}
                                  </div>
                                ))}
                                {Object.keys(f.data || {}).length > 4 && (
                                  <div className="text-[10px] text-muted-foreground italic">
                                    + {Object.keys(f.data || {}).length - 4} campos más
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 align-top text-red-400 break-words">{f.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Defensive: if a row somehow has zero successes AND zero
                    failures, show something so the panel isn't empty. */}
                {log.success_count === 0 && log.failure_count === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Sin filas registradas para este import.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CsvImportLogsView;
