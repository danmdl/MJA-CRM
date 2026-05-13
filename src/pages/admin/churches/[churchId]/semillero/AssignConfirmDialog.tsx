import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export type ConfirmDialogState = {
  type: 'auto';
  preview?: { label: string; count: number }[];
} | {
  type: 'auto_selected';
} | {
  type: 'cuerda_only';
  contactId: string;
  cuerdaNum: string;
  cuerdaZonaId?: string;
} | {
  type: 'pre_assign';
  contactId: string;
  cellId: string;
  cellName: string;
  cuerdaNum?: string;
  zonaName?: string;
} | {
  type: 'assign';
  contactId: string;
  cellId: string;
  cellName: string;
  cuerdaNum?: string;
  zonaName?: string;
};

interface AssignConfirmDialogProps {
  state: ConfirmDialogState | null;
  onOpenChange: (open: boolean) => void;
  visibleSelectedCount: number;
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Unified assignment confirmation modal — covers all five flows the
 * Semillero offers (auto, auto-selected, cuerda-only, pre-assign,
 * single-cell-assign). The actual mutations live in the parent;
 * this component only renders the right copy + delegates back via
 * `onConfirm`. Centralizing the dialog UI here keeps the message
 * wording consistent.
 */
export const AssignConfirmDialog = ({
  state, onOpenChange, visibleSelectedCount, pending, onConfirm,
}: AssignConfirmDialogProps) => {
  const title =
    state?.type === 'auto' ? 'Autoasignar contactos'
      : state?.type === 'auto_selected' ? `Autoasignar ${visibleSelectedCount} seleccionados`
        : state?.type === 'pre_assign' ? 'Pre-asignar contacto'
          : 'Confirmar asignación';

  const cellName = state && 'cellName' in state ? state.cellName : null;
  const cuerdaNum = state && 'cuerdaNum' in state ? state.cuerdaNum : null;
  const zonaName = state && 'zonaName' in state ? state.zonaName : null;

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>
              {state?.type === 'auto' ? (
                <>
                  <p>Se asignarán los contactos a la célula más cercana según su dirección.</p>
                  {state.preview && state.preview.length > 0 && (
                    <div className="mt-3 space-y-1 border rounded-md p-3 bg-muted/50">
                      <p className="text-xs font-medium text-foreground mb-2">Vista previa:</p>
                      {state.preview.map(p => (
                        <div key={p.label} className="flex justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                          <span>{p.label}</span>
                          <span className="font-mono font-medium tabular-nums">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : state?.type === 'auto_selected' ? (
                <p>Se asignarán los <strong>{visibleSelectedCount}</strong> contactos seleccionados a la célula más cercana según su dirección. Solo se asignarán los que tengan dirección y no estén ya asignados a una célula.</p>
              ) : state?.type === 'pre_assign' ? (
                <>
                  <p>
                    ¿Pre-asignar a <strong>{cellName}</strong>
                    {cuerdaNum && <> (Cuerda {cuerdaNum})</>}
                    {zonaName && <> — {zonaName}</>}?
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Va a quedar pendiente en tu outbox <strong>"Asignar Contactos"</strong> hasta que confirmes la asignación final.
                  </p>
                </>
              ) : (
                <p>
                  ¿Asignar a <strong>{cellName}</strong>
                  {cuerdaNum && <> (Cuerda {cuerdaNum})</>}
                  {zonaName && <> — {zonaName}</>}?
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm()} disabled={pending}>
            {pending ? 'Asignando...' : state?.type === 'pre_assign' ? 'Pre-asignar' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
