import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedCount: number;
  deleting: boolean;
  onConfirm: () => void | Promise<void>;
}

export const BulkDeleteDialog = ({ open, onOpenChange, selectedCount, deleting, onConfirm }: BulkDeleteDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !deleting) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar contactos</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de eliminar <strong>{selectedCount}</strong> contacto{selectedCount === 1 ? '' : 's'}? Los vas a poder restaurar desde la Papelera.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>Cancelar</Button>
          <Button variant="destructive" disabled={deleting} onClick={() => onConfirm()}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar {selectedCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
