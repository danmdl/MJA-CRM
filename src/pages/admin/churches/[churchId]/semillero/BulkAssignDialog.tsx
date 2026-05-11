import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  numero_cuerda: string | null;
}

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedCount: number;
  assigning: boolean;
  targetId: string;
  onTargetChange: (id: string) => void;
  teamMembers: TeamMember[] | undefined;
  canSeeAllCuerdas: boolean;
  userCuerdaNumero: string | null;
  onConfirm: () => void | Promise<void>;
}

export const BulkAssignDialog = ({
  open, onOpenChange, selectedCount, assigning,
  targetId, onTargetChange, teamMembers, canSeeAllCuerdas, userCuerdaNumero, onConfirm,
}: BulkAssignDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !assigning) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Asignar Responsable</DialogTitle>
          <DialogDescription>
            Vas a asignar un responsable a <strong>{selectedCount}</strong> contacto{selectedCount === 1 ? '' : 's'}.
            Esto va a sobreescribir el responsable actual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nuevo responsable</label>
          <select
            className="w-full h-9 text-sm border rounded px-2 bg-background"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
            disabled={assigning}
          >
            <option value="">Seleccionar responsable...</option>
            <option value="__none__">— Sin responsable (limpiar)</option>
            {(teamMembers || [])
              .filter(m => {
                if (!m.id) return false;
                // Non-global users can only assign to people in their own cuerda.
                // Prevents a referente of cuerda 202 from assigning a contact
                // to a referente of cuerda 101.
                if (!canSeeAllCuerdas) {
                  if (!userCuerdaNumero) return false;
                  return m.numero_cuerda === userCuerdaNumero;
                }
                return true;
              })
              .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
              .map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ))}
          </select>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={assigning}>Cancelar</Button>
          <Button disabled={assigning || !targetId} onClick={() => onConfirm()}>
            {assigning ? 'Asignando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
