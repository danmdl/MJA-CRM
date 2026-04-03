import React, { useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/utils/toast';
import { HelpCircle, Send } from 'lucide-react';

const InfoPage = () => {
  const { session, profile } = useSession();
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMsg, setSupportMsg] = useState('');
  const [sending, setSending] = useState(false);

  const sendSupport = async () => {
    if (!supportMsg.trim()) { showError('Escribí tu mensaje.'); return; }
    setSending(true);
    try {
      // Find admin user(s)
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

      showSuccess('Mensaje de soporte enviado al administrador.');
      setSupportMsg('');
      setSupportOpen(false);
    } catch { showError('Error inesperado.'); } finally { setSending(false); }
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">Información del Sistema</h1>

      {/* Hierarchy */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orden Jerárquico</h2>
        <div className="space-y-1 text-sm">
          <div className="p-2.5 rounded border bg-primary/10 border-primary/30 font-medium">1. Admin — Control total del sistema y todas las iglesias</div>
          <div className="p-2.5 rounded border bg-primary/5 border-primary/20 font-medium">2. General — Acceso completo a una iglesia específica</div>
          <div className="p-2.5 rounded border">3. Pastor — Ve y administra su iglesia, asigna contactos</div>
          <div className="p-2.5 rounded border">4. Supervisor — Ve analíticas y datos de su iglesia</div>
          <div className="p-2.5 rounded border">5. Referente — Ve los datos de su cuerda y analíticas</div>
          <div className="p-2.5 rounded border">6. Encargado de Célula — Gestiona su célula asignada</div>
          <div className="p-2.5 rounded border">7. Conector — Solo puede crear contactos en el Pool</div>
          <div className="p-2.5 rounded border text-muted-foreground">8. Anfitrión — Acceso mínimo, solo su perfil</div>
        </div>
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

      {/* Pool logic */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">¿Cómo funciona el Pool?</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>El <span className="text-foreground font-medium">Pool</span> es la bandeja de entrada de contactos nuevos. Cuando un conector sale a la calle y conoce a alguien, crea el contacto ahí.</p>
          <p>Los contactos en el Pool están <span className="text-foreground font-medium">Sin Asignar</span> — no tienen célula ni cuerda todavía.</p>
          <p>Un pastor, general o admin puede <span className="text-foreground font-medium">asignar</span> un contacto del Pool a una célula específica. Al hacerlo, el contacto se mueve automáticamente a la <span className="text-foreground font-medium">Base de Datos</span>.</p>
          <p>La Base de Datos muestra todos los contactos que ya fueron procesados y asignados a una cuerda/célula.</p>
        </div>
      </section>

      {/* Cuerda logic */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Número de Cuerda</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>Cada cuerda tiene un <span className="text-foreground font-medium">número</span> (ej: 101, 202, 301) que identifica a qué zona pertenece.</p>
          <p>Las cuerdas que empiezan con <span className="text-foreground font-medium">1xx</span> y <span className="text-foreground font-medium">2xx</span> corresponden a la misma zona (ej: 101 y 201 son ambas de San Martín).</p>
          <p>Cambiar el número de cuerda de un contacto es una acción <span className="text-foreground font-medium">delicada</span> — para la mayoría de los roles, el contacto se devuelve al Pool para ser reasignado.</p>
        </div>
      </section>

      {/* Pipeline */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pipeline de Seguimiento</h2>
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

      {/* Support */}
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

      {/* Support dialog */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Pedir ayuda a Soporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Tu mensaje será enviado al administrador del sistema. Podés adjuntar una captura de pantalla haciendo una captura y pegándola en el chat de WhatsApp o describiéndola acá.</p>
            <Textarea
              placeholder="Describí tu problema o duda..."
              value={supportMsg}
              onChange={e => setSupportMsg(e.target.value)}
              rows={5}
            />
            <p className="text-[10px] text-muted-foreground">Tip: si necesitás adjuntar una captura, hacé una screenshot y enviala por WhatsApp al admin junto con este mensaje.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSupportOpen(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={sendSupport} disabled={sending}>
                <Send className="h-3.5 w-3.5" /> {sending ? 'Enviando...' : 'Enviar a Soporte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfoPage;
