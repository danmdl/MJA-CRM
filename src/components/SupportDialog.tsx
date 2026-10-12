import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showError } from '@/utils/toast';
import { Send, MessageSquare, CheckCircle2 } from 'lucide-react';

const KINDS = ['Problema', 'Pregunta', 'Sugerencia'] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sends a message straight to the admin's Mensajes inbox through the
// send_support_message RPC, so it works for every role regardless of
// messaging permissions. Replies come back to the user's own inbox.
const SupportDialog = ({ open, onOpenChange }: Props) => {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Problema');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) setSent(false);
  }, [open]);

  const send = async () => {
    if (!body.trim()) { showError('Escribí tu mensaje.'); return; }
    setSending(true);
    try {
      const { error } = await supabase.rpc('send_support_message' as any, {
        p_body: body.trim(),
        p_kind: kind,
      });
      if (error) { showError(error.message || 'Error al enviar.'); return; }
      setBody('');
      setKind('Problema');
      setSent(true);
    } catch {
      showError('Error inesperado.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {sent ? (
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">¡Mensaje enviado!</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Le llegó al administrador. La respuesta va a aparecer en tu bandeja de <strong>Mensajes</strong>.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <Link to="/admin/messages" onClick={() => onOpenChange(false)}>
                  <MessageSquare className="h-4 w-4" /> Ir a Mensajes
                </Link>
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>Entendido</Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Contactar a soporte</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tu mensaje le llega directo al administrador del sistema. Te responde por <strong>Mensajes</strong>.
              </p>
              <div className="flex gap-1.5">
                {KINDS.map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      kind === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder={
                  kind === 'Problema'
                    ? 'Contá qué pasó: qué estabas haciendo, en qué pantalla y qué error viste...'
                    : kind === 'Pregunta'
                      ? '¿Qué querés saber?'
                      : '¿Qué te gustaría que mejoremos?'
                }
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={6}
                maxLength={4000}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button size="sm" className="gap-1.5" onClick={send} disabled={sending || !body.trim()}>
                  <Send className="h-3.5 w-3.5" /> {sending ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SupportDialog;
