// Promise-based confirm() backed by shadcn AlertDialog.
//
// Replaces window.confirm() across the app. Same call shape:
//   const ok = await confirm({ title, description, confirmLabel? });
//   if (!ok) return;
//
// window.confirm is blocking, ugly on mobile, can't be styled, and was
// flagged by the audit as a UX regression (CelulasPage / CuerdasPage /
// HogaresDePazPage / ContactLogDialog).

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: '' });
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleResolve = (ok: boolean) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    // Defer the resolve a tick so the dialog close transition runs
    // before downstream code (which often opens another dialog or
    // changes state) fires.
    setTimeout(() => r?.(ok), 0);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={o => { if (!o) handleResolve(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleResolve(false)}>
              {opts.cancelLabel || 'Cancelar'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleResolve(true)}
              className={opts.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            >
              {opts.confirmLabel || 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
};
