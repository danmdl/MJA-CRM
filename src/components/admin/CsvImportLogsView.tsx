"use client";
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, Upload, CheckCircle2, AlertCircle, Download } from 'lucide-react';
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

interface Props {
  churchId: string;
}

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
        const allSuccess = log.failure_count === 0;
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
              <div className="px-4 pb-3 border-t border-border/50 pt-3 space-y-2">
                {allSuccess ? (
                  <div className="text-sm text-muted-foreground">
                    Todas las filas importadas correctamente. ✅
                  </div>
                ) : (
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CsvImportLogsView;
