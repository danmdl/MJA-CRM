"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId?: string;
}

const InviteUserDialog = ({ open, onOpenChange, churchId }: InviteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[DEBUG] Form submitted with email:', email);
    
    if (!email) {
      alert('Por favor, introduce un correo electrónico');
      return;
    }

    setLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('Invitación enviada con éxito (simulado)');
      setEmail('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al enviar invitación');
    } finally {
      setLoading(false);
    }
  };

  console.log('[DEBUG] InviteUserDialog rendered, open:', open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invitar a un nuevo miembro</DialogTitle>
          <DialogDescription>
            Introduce el correo electrónico para invitar a un nuevo miembro.
            {churchId && <p className="text-sm text-muted-foreground mt-1">Church ID: {churchId}</p>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Correo Electrónico</label>
            <Input 
              type="email"
              placeholder="nombre@ejemplo.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar Invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;