"use client";
import React, { useState } from 'react';
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
// row. The csv_import_logs entry is written AFTER the contacts loop
// finishes, so the log's created_at is roughly right after the last insert.
// We pull every contact created by the same user inside a window that ends
// at the log timestamp + a small buffer, then take the most-recent
// success_count of them.
//
// Why a window instead of an exact join: the import doesn't tag each
// contact with the import_log_id (it predates the log table). We could
// migrate the schema and backfill, but the time-window approach gives an
// answer for every existing log row without a DB change. The window is
// generous enough (10 min before + 30 sec after) to comfortably capture
// even slow imports of thousands of rows.
const ImportedContactsList = ({ log }: { log: ImportLog }) => {
  const { data: contacts = [], isLoading } = useQuery<ImportedContact[]>({
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
      // We asked for the most recent first so we pick up the import block;
      // re-flip so the user sees them in the order they were inserted (the
      // file's row order).
      return (data || []).reverse() as ImportedContact[];
    },
    // Only run when this log row is expanded — keeps the page light when
    // there are 50 imports listed and the user only opens one.
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Cargando contactos importados...</div>;
  }

  if (contacts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        No pudimos recuperar la lista de contactos para este import.
      </div>
    );
  }

  // Soft warning if the count we recovered doesn't match what the log
  // claims succeeded. Could mean some contacts were soft-deleted later, or
  // that the user did manual creates inside the same window. Either way
  // we'd rather show what we found and label the discrepancy than hide it.
  const mismatch = contacts.length !== log.success_count;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {contacts.length} contacto{contacts.length === 1 ? '' : 's'} cargado{contacts.length === 1 ? '' : 's'}
          {mismatch && (
            <span className="text-amber-400 ml-1">
              (el log indica {log.success_count}; algunos pueden haber sido eliminados después)
            </span>
          )}
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
            {contacts.map((c, i) => (
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
        .select('id, user_id, church_id, entity_type, filename, total_rows, success_count, failure_count, failures, created_at')
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
