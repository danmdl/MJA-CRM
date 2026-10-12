import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle, Send } from 'lucide-react';
import SupportDialog from '@/components/SupportDialog';

const InfoPage = () => {
  const [supportOpen, setSupportOpen] = useState(false);

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

      {/* Semillero */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">¿Cómo funciona el Semillero?</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>El <span className="text-foreground font-medium">Semillero</span> es la bandeja de entrada de contactos nuevos. Cuando un conector sale a la calle y conoce a alguien, crea el contacto ahí.</p>
          <p>Los contactos arrancan <span className="text-foreground font-medium">sin asignar</span> a una célula. Cada cuerda ve los contactos que les corresponden por su <span className="text-foreground font-medium">numero_cuerda</span>.</p>
          <p>Si un contacto cae en otra zona, el referente lo manda a <span className="text-foreground font-medium">MJA</span> (la cuerda de la iglesia) para que el admin lo distribuya a la cuerda correcta.</p>
          <p>Solo admin / general / pastor / supervisor pueden asignar contactos a una célula específica. El resto solo puede enviarlos a MJA.</p>
        </div>
      </section>

      {/* Cuerda logic */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Número de Cuerda</h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>Cada cuerda tiene un <span className="text-foreground font-medium">número</span> (ej: 101, 202, 301) que identifica a qué zona pertenece.</p>
          <p>Las cuerdas <span className="text-foreground font-medium">1xx</span> son masculinas, las <span className="text-foreground font-medium">2xx</span> son femeninas. Dentro de las <span className="text-foreground font-medium">3xx</span>, <span className="text-foreground font-medium">301</span> es de hombres y <span className="text-foreground font-medium">302</span> es de mujeres.</p>
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

      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
};

export default InfoPage;
