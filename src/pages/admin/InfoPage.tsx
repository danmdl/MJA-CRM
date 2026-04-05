import React, { useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/utils/toast';
import { HelpCircle, Send, MessageSquare, CheckCircle2 } from 'lucide-react';

const InfoPage = () => {
  const { session, profile } = useSession();
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMsg, setSupportMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sendSupport = async () => {
    if (!supportMsg.trim()) { showError('Escribí tu mensaje.'); return; }
    setSending(true);
    try {
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (!admins || admins.length === 0) { showError('No se encontró un admin.'); return; }

      const { data: msg, error } = await supabase.from('messages').insert({
        sender_id: session?.user?.id,
        church_id: profile?.church_id || null,
        body: `[SOPORTE] ${supportMsg.trim()}`,
      }).select('id').single();

      if (error || !msg) { showError('Error al enviar.'); return; }

      await supabase.from('message_recipients').insert(
        admins.map(a => ({ message_id: msg.id, recipient_id: a.id }))
      );

      setSupportMsg('');
      setSupportOpen(false);
      setConfirmOpen(true);
      // Auto-close confirmation after 5 seconds
      setTimeout(() => setConfirmOpen(false), 5000);
    } catch { showError('Error inesperado.'); } finally { setSending(false); }
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">Información del Sistema</h1>

      {/* Support — FIRST */}
      <section className="p-4 rounded border border-primary/30 bg-primary/5 space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">¿Necesitás ayuda?</h2>
        </div>
        <p className="text-sm text-muted-foreground">Si tenés alguna duda o problema con el sistema, podés enviar un mensaje directamente al administrador.</p>
        <Button size="sm" className="gap-1.5" onClick={() => setSupportOpen(true)}>
          <Send className="h-3.5 w-3.5" /> Pedir ayuda a Soporte
        </Button>
      </section>

      {/* Structure */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Estructura de Datos</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p><span className="text-foreground font-medium">Iglesia</span> → contiene Zonas (localidades como Villa Lynch, San Martín, etc.)</p>
          <p><span className="text-foreground font-medium">Zona</span> → contiene Cuerdas (ej: Cuerda 102 pertenece a Villa Lynch)</p>
          <p><span className="text-foreground font-medium">Cuerda</span> → contiene Células (cada célula tiene dirección, día, hora, líder y anfitrión)</p>
          <p><span className="text-foreground font-medium">Célula</span> → contiene Contactos (personas asignadas a esa célula)</p>
        </div>
      </section>

      {/* Semillero + Datos Globales */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">¿Cómo funciona el Semillero y los Datos Globales?</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>El <span className="text-foreground font-medium">Semillero</span> es la bandeja de entrada de contactos nuevos. Cuando un conector sale a la calle y conoce a alguien, crea el contacto ahí.</p>
          <p>Los contactos en el Semillero están <span className="text-foreground font-medium">sin asignar</span> — no tienen célula ni cuerda todavía.</p>
          <p>Un pastor, general o admin puede <span className="text-foreground font-medium">asignar</span> un contacto a una cuerda o célula. Al hacerlo, el contacto se mueve automáticamente a <span className="text-foreground font-medium">Datos Globales</span>.</p>
          <p><span className="text-foreground font-medium">Datos Globales</span> muestra todos los contactos que ya fueron procesados y asignados. Cada usuario ve solamente los contactos de su cuerda, a menos que tenga permiso para ver todas.</p>
        </div>
      </section>

      {/* Cuerda logic */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Número de Cuerda</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>Cada cuerda tiene un <span className="text-foreground font-medium">número</span> (ej: 101, 202, 301) que identifica a qué zona pertenece.</p>
          <p>Las cuerdas <span className="text-foreground font-medium">1xx</span> son masculinas, las <span className="text-foreground font-medium">2xx</span> son femeninas, y las <span className="text-foreground font-medium">3xx</span> son mixtas.</p>
          <p>Cambiar el número de cuerda de un contacto es una acción <span className="text-foreground font-medium">delicada</span> — para la mayoría de los roles, el contacto se devuelve al Semillero para ser reasignado.</p>
        </div>
      </section>

      {/* Pipeline */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Estados de Seguimiento</h2>
        <div className="text-sm space-y-1 text-muted-foreground">
          <p><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2 align-middle"></span><span className="text-foreground font-medium">Nuevo</span> — recién ingresado al sistema</p>
          <p><span className="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-2 align-middle"></span><span className="text-foreground font-medium">Contactado</span> — ya se le habló por teléfono o WhatsApp</p>
          <p><span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-2 align-middle"></span><span className="text-foreground font-medium">Visitó célula</span> — asistió al menos una vez</p>
          <p><span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2 align-middle"></span><span className="text-foreground font-medium">Activo</span> — asiste regularmente</p>
          <p><span className="inline-block w-3 h-3 rounded-full bg-gray-500 mr-2 align-middle"></span><span className="text-foreground font-medium">Inactivo</span> — dejó de asistir</p>
        </div>
      </section>

      {/* Papelera */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Papelera</h2>
        <div className="text-sm text-muted-foreground">
          <p>Cuando se elimina un contacto o célula, va a la <span className="text-foreground font-medium">Papelera</span> con un período de gracia de <span className="text-foreground font-medium">7 días</span>. Durante ese tiempo se puede restaurar. Después de 7 días, un administrador puede eliminarlo permanentemente.</p>
        </div>
      </section>

      {/* Support dialog */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Pedir ayuda a Soporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Tu mensaje será enviado al administrador del sistema a través del sistema de mensajería interno.</p>
            <Textarea
              placeholder="Describí tu problema o duda..."
              value={supportMsg}
              onChange={e => setSupportMsg(e.target.value)}
              rows={5}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSupportOpen(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={sendSupport} disabled={sending}>
                <Send className="h-3.5 w-3.5" /> {sending ? 'Enviando...' : 'Enviar a Soporte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog after sending */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">¡Mensaje enviado!</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Tu mensaje fue enviado al administrador. La respuesta llegará a tu bandeja de <strong>Mensajes</strong>.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="text-xs font-medium">💬 Mensajes</p>
                <p className="text-[10px] text-muted-foreground">Revisá tu bandeja para ver la respuesta</p>
              </div>
              <span className="text-primary text-lg ml-1">←</span>
            </div>
            <Button size="sm" onClick={() => setConfirmOpen(false)}>Entendido</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfoPage;
