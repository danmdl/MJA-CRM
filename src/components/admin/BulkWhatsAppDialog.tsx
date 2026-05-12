"use client";
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Send, ExternalLink, Check } from 'lucide-react';
import { normalizeArgentinePhoneForWhatsapp } from '@/lib/phone-validation';

interface ContactItem {
  id: string;
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
}

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: ContactItem[];
  churchId?: string;
  onSent?: (sentContactIds: string[], message: string, templateName: string | null) => void;
}

interface Template {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
}

const BulkWhatsAppDialog = ({ open, onOpenChange, contacts, churchId, onSent }: BulkWhatsAppDialogProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [message, setMessage] = useState('');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Load templates
  useEffect(() => {
    if (!open) return;
    (async () => {
      const userId = (await supabase.auth.getSession()).data.session?.user?.id;
      const { data } = await supabase.from('whatsapp_templates')
        .select('id, name, body, is_default')
        .or(`user_id.eq.${userId},is_system.eq.true${churchId ? `,church_id.eq.${churchId}` : ''}`)
        .order('is_default', { ascending: false })
        .order('name');
      const list = (data || []) as Template[];
      setTemplates(list);
      // Auto-select default template
      const def = list.find(t => t.is_default);
      if (def) {
        setSelectedTemplateName(def.name);
        setMessage(def.body);
      }
    })();
  }, [open, churchId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSentIds(new Set());
      setSending(false);
    }
  }, [open]);

  const validContacts = contacts.filter(c => {
    const wa = normalizeArgentinePhoneForWhatsapp(c.phone || '');
    return !!wa;
  });
  const invalidCount = contacts.length - validContacts.length;

  const replaceVars = (msg: string, contact: ContactItem): string => {
    return msg
      .replace(/\{nombre\}/gi, contact.first_name || '')
      .replace(/\{apellido\}/gi, contact.last_name || '')
      .replace(/\{nombre_completo\}/gi, [contact.first_name, contact.last_name].filter(Boolean).join(' '));
  };

  const handleTemplateChange = (name: string) => {
    setSelectedTemplateName(name);
    const t = templates.find(x => x.name === name);
    if (t) setMessage(t.body);
  };

  const handleSendOne = (contact: ContactItem) => {
    const wa = normalizeArgentinePhoneForWhatsapp(contact.phone || '');
    if (!wa) return;
    const text = replaceVars(message, contact);
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank');
    setSentIds(prev => new Set(prev).add(contact.id));
  };

  const handleSendAll = async () => {
    if (!message.trim()) { showError('Escribí un mensaje primero.'); return; }
    if (validContacts.length === 0) { showError('No hay contactos con teléfono válido.'); return; }
    setSending(true);
    // Open a tab for each, with a small delay so the browser doesn't block as popups
    for (let i = 0; i < validContacts.length; i++) {
      const contact = validContacts[i];
      handleSendOne(contact);
      // Small delay so the browser doesn't classify this as popup spam
      if (i < validContacts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    setSending(false);
    showSuccess(`Se abrieron ${validContacts.length} chats de WhatsApp.`);
    // Notify parent so it can log to history
    if (onSent) {
      const t = templates.find(x => x.name === selectedTemplateName);
      const templateUsed = t && t.body === message ? selectedTemplateName : null;
      onSent(validContacts.map(c => c.id), message, templateUsed);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp a {validContacts.length} {validContacts.length === 1 ? 'persona' : 'personas'}</DialogTitle>
          <DialogDescription>
            {invalidCount > 0
              ? `${invalidCount} contacto${invalidCount === 1 ? '' : 's'} sin teléfono válido (omitidos).`
              : 'Se abrirá una pestaña de WhatsApp por cada contacto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector */}
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Template</Label>
              <select
                value={selectedTemplateName}
                onChange={e => handleTemplateChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Sin template (escribir manual)</option>
                {templates.map(t => (
                  <option key={t.id} value={t.name}>{t.name}{t.is_default ? ' ⭐' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Message editor */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Mensaje</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Escribí el mensaje. Usá {nombre} para personalizar."
            />
            <p className="text-xs text-muted-foreground">
              Variables: <code className="text-xs bg-muted px-1 rounded">{'{nombre}'}</code> · <code className="text-xs bg-muted px-1 rounded">{'{apellido}'}</code> · <code className="text-xs bg-muted px-1 rounded">{'{nombre_completo}'}</code>
            </p>
          </div>

          {/* Recipients list */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Destinatarios ({validContacts.length})</Label>
            <div className="border rounded-md max-h-[180px] overflow-y-auto">
              {validContacts.map(c => {
                const isSent = sentIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {isSent && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                      <span className="font-medium truncate">{c.first_name} {c.last_name || ''}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{c.phone}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSendOne(c)}
                      className="h-7 text-xs gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </Button>
                  </div>
                );
              })}
              {invalidCount > 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground bg-red-500/5">
                  ⚠️ {invalidCount} contacto{invalidCount === 1 ? '' : 's'} omitido{invalidCount === 1 ? '' : 's'} por número inválido.
                </div>
              )}
            </div>
          </div>

          {/* Browser popup warning */}
          <div className="text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2">
            ℹ️ Se va a abrir una pestaña de WhatsApp por cada destinatario. Si el navegador bloquea las pestañas, autorizá los popups para este sitio.
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending} className="w-full sm:w-auto">
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={handleSendAll}
            disabled={sending || !message.trim() || validContacts.length === 0}
            className="w-full sm:w-auto gap-2"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Abriendo chats...' : `Enviar a ${validContacts.length}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkWhatsAppDialog;
