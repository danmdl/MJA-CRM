import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, RotateCcw, Clock } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePermissions } from '@/lib/permissions';

interface DeletedItem {
  id: string;
  type: 'contact' | 'cell';
  name: string;
  detail: string;
  deleted_at: string;
  deleted_by_name: string;
  days_left: number;
}

const GRACE_DAYS = 7;

const PapeleraPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const queryClient = useQueryClient();
  const { canRestoreDeleted } = usePermissions();
  const [confirmAction, setConfirmAction] = useState<{ type: 'restore' | 'purge'; item: DeletedItem } | null>(null);

  const { data: items, isLoading } = useQuery<DeletedItem[]>({
    queryKey: ['papelera', churchId],
    queryFn: async () => {
      // Fetch deleted contacts
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, numero_cuerda, deleted_at, deleted_by')
        .eq('church_id', churchId!)
        .not('deleted_at', 'is', null);

      // Fetch deleted cells
      const { data: cells } = await supabase
        .from('cells')
        .select('id, name, address, deleted_at, deleted_by')
        .eq('church_id', churchId!)
        .not('deleted_at', 'is', null);

      // Resolve names of who deleted
      const deleterIds = new Set<string>();
      (contacts || []).forEach(c => { if (c.deleted_by) deleterIds.add(c.deleted_by); });
      (cells || []).forEach(c => { if (c.deleted_by) deleterIds.add(c.deleted_by); });
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', Array.from(deleterIds));
      const nameMap = new Map((profiles || []).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sistema']));

      const now = Date.now();
      const result: DeletedItem[] = [];

      (contacts || []).forEach(c => {
        const deletedMs = new Date(c.deleted_at).getTime();
        const daysElapsed = Math.floor((now - deletedMs) / (1000 * 60 * 60 * 24));
        result.push({
          id: c.id,
          type: 'contact',
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre',
          detail: c.numero_cuerda ? `Cuerda ${c.numero_cuerda}` : 'Sin cuerda',
          deleted_at: c.deleted_at,
          deleted_by_name: nameMap.get(c.deleted_by) || 'Sistema',
          days_left: Math.max(0, GRACE_DAYS - daysElapsed),
        });
      });

      (cells || []).forEach(c => {
        const deletedMs = new Date(c.deleted_at).getTime();
        const daysElapsed = Math.floor((now - deletedMs) / (1000 * 60 * 60 * 24));
        result.push({
          id: c.id,
          type: 'cell',
          name: c.name || 'Célula sin nombre',
          detail: c.address || 'Sin dirección',
          deleted_at: c.deleted_at,
          deleted_by_name: nameMap.get(c.deleted_by) || 'Sistema',
          days_left: Math.max(0, GRACE_DAYS - daysElapsed),
        });
      });

      return result.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
    },
    enabled: !!churchId,
  });

  const handleRestore = async (item: DeletedItem) => {
    const table = item.type === 'contact' ? 'contacts' : 'cells';
    const { error } = await supabase.from(table).update({ deleted_at: null, deleted_by: null }).eq('id', item.id);
    if (error) { showError(error.message); return; }
    showSuccess(`${item.type === 'contact' ? 'Contacto' : 'Célula'} "${item.name}" restaurado/a.`);
    queryClient.invalidateQueries({ queryKey: ['papelera'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['celulas-page'] });
    queryClient.invalidateQueries({ queryKey: ['cells'] });
    setConfirmAction(null);
  };

  const handlePurge = async (item: DeletedItem) => {
    const table = item.type === 'contact' ? 'contacts' : 'cells';
    const { error } = await supabase.from(table).delete().eq('id', item.id);
    if (error) { showError(error.message); return; }
    showSuccess(`${item.type === 'contact' ? 'Contacto' : 'Célula'} eliminado/a permanentemente.`);
    queryClient.invalidateQueries({ queryKey: ['papelera'] });
    setConfirmAction(null);
  };

  const fmtDate = (ts: string) => { try { return format(new Date(ts), "d MMM yy, HH:mm", { locale: es }); } catch { return ts; } };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando papelera...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Papelera</h1>
        <span className="text-sm text-muted-foreground">{(items || []).length} elemento(s)</span>
      </div>

      <p className="text-xs text-muted-foreground">Los elementos eliminados se pueden recuperar dentro de los {GRACE_DAYS} días. Después se eliminan permanentemente.</p>

      {(items || []).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">La papelera está vacía.</p>
        </div>
      )}

      <div className="space-y-2">
        {(items || []).map(item => (
          <div key={`${item.type}-${item.id}`} className={`p-3 rounded border flex items-center justify-between gap-3 ${item.days_left === 0 ? 'border-red-500/30 bg-red-500/5' : ''}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{item.type === 'contact' ? 'Contacto' : 'Célula'}</Badge>
                <span className="text-sm font-medium truncate">{item.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Eliminado por {item.deleted_by_name} · {fmtDate(item.deleted_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {item.days_left > 0 ? <span>{item.days_left}d</span> : <span className="text-red-400">Expirado</span>}
              </div>
              {canRestoreDeleted() && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmAction({ type: 'restore', item })}>
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </Button>
              )}
              {canRestoreDeleted() && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 gap-1" onClick={() => setConfirmAction({ type: 'purge', item })}>
                  <Trash2 className="h-3 w-3" /> Eliminar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{confirmAction?.type === 'restore' ? 'Restaurar elemento' : 'Eliminar permanentemente'}</DialogTitle>
          </DialogHeader>
          {confirmAction && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {confirmAction.type === 'restore'
                  ? `¿Restaurar "${confirmAction.item.name}" a su ubicación original?`
                  : `¿Eliminar "${confirmAction.item.name}" permanentemente? Esta acción no se puede deshacer.`
                }
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>Cancelar</Button>
                {confirmAction.type === 'restore'
                  ? <Button size="sm" onClick={() => handleRestore(confirmAction.item)}>Restaurar</Button>
                  : <Button size="sm" variant="destructive" onClick={() => handlePurge(confirmAction.item)}>Eliminar permanentemente</Button>
                }
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PapeleraPage;
