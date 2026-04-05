"use client";
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { showSuccess, showError } from '@/utils/toast';
import { Save, Edit3, X, Star, Trash2 } from 'lucide-react';

// Real green WhatsApp icon
const WhatsAppIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

interface WhatsAppTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  is_system: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  churchId?: string;
  onSent?: (message: string) => void;
}

const WhatsAppComposeDialog = ({ open, onOpenChange, contactName, contactFirstName, contactLastName, contactPhone, churchId, onSent }: Props) => {
  const { session, profile } = useSession();
  const { canUseTemplates } = usePermissions();
  const userId = session?.user?.id;
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [saveMode, setSaveMode] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [churchData, setChurchData] = useState<{ address?: string; website?: string; hours?: string } | null>(null);

  // Fetch church data (prefer explicit churchId prop, fall back to user's church)
  useEffect(() => {
    const fetchChurchData = async () => {
      const targetChurchId = churchId || profile?.church_id;
      if (!targetChurchId) return;
      const { data } = await supabase
        .from('churches')
        .select('address, website, hours')
        .eq('id', targetChurchId)
        .single();
      setChurchData(data);
    };
    if (open) fetchChurchData();
  }, [open, churchId, profile?.church_id]);

  // Replace variables in template body
  const replaceVars = (body: string) => {
    return body
      .replace(/\{nombre\.contacto\}/gi, contactFirstName || '')
      .replace(/\{nombre\.usuario\}/gi, profile?.first_name || '')
      .replace(/\{direccion\.iglesia\}/gi, churchData?.address || '')
      .replace(/\{website\.iglesia\}/gi, churchData?.website || '')
      .replace(/\{horarios\.iglesia\}/gi, churchData?.hours || '');
  };

  // Load templates
  const loadTemplates = async (autoLoadDefault = false) => {
    if (!userId || !canUseTemplates()) return;
    const { data } = await supabase.from('whatsapp_templates')
      .select('id, name, body, is_default, is_system')
      .or(`user_id.eq.${userId},is_system.eq.true`)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('is_system', { ascending: false })
      .order('name');
    const list = (data || []) as WhatsAppTemplate[];
    setTemplates(list);
    // Auto-load default template into composer (user's own default takes priority)
    if (autoLoadDefault) {
      const def = list.find(t => t.is_default && !t.is_system);
      if (def) {
        setMessage(replaceVars(def.body));
      }
    }
  };

  useEffect(() => {
    if (open) {
      setMessage('');
      setSaveMode(false);
      setSaveAsDefault(false);
      setExpandedTemplateId(null);
      loadTemplates(true); // auto-load default
    }
  }, [open, userId]);

  const handleSelectTemplate = (t: WhatsAppTemplate) => {
    setMessage(replaceVars(t.body));
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim() || !message.trim() || !userId) return;
    // If saving as default, unset all existing defaults first
    if (saveAsDefault) {
      await supabase.from('whatsapp_templates').update({ is_default: false }).eq('user_id', userId);
    }
    const { error } = await supabase.from('whatsapp_templates').insert({
      user_id: userId,
      name: newTemplateName.trim(),
      body: message.trim(),
      is_default: saveAsDefault,
    });
    if (error) { showError('Error al guardar plantilla.'); return; }
    showSuccess(saveAsDefault ? 'Plantilla guardada como default.' : 'Plantilla guardada.');
    setNewTemplateName('');
    setSaveAsDefault(false);
    setSaveMode(false);
    loadTemplates();
  };

  const handleSend = () => {
    if (!message.trim() || !contactPhone) return;
    const cleanPhone = contactPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    if (onSent) onSent(message);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <WhatsAppIcon className="h-5 w-5 text-green-500" />
            Enviar WhatsApp a {contactName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[500px]">
          {/* LEFT: Message composer */}
          <div className={`flex-1 p-4 flex flex-col gap-3 ${canUseTemplates() ? 'border-r' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensaje</label>
              <span className="text-[10px] text-muted-foreground">{message.length} caracteres</span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={canUseTemplates() ? "Escribí tu mensaje o seleccioná una plantilla →" : "Escribí tu mensaje"}
              className="flex-1 text-sm resize-none min-h-[300px]"
            />

            {saveMode ? (
              <div className="p-2 rounded-md bg-muted/40 border space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Nombre de la plantilla"
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleSaveAsTemplate} disabled={!newTemplateName.trim() || !message.trim()}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setSaveMode(false); setNewTemplateName(''); setSaveAsDefault(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    className="rounded border-input"
                  />
                  Guardar como default (se precargará automáticamente cada vez)
                </label>
              </div>
            ) : (
              canUseTemplates() && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs w-full"
                  onClick={() => setSaveMode(true)}
                  disabled={!message.trim()}
                >
                  <Save className="h-3.5 w-3.5" /> Save as template
                </Button>
              )
            )}

            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSend}
              disabled={!message.trim()}
            >
              <WhatsAppIcon className="h-4 w-4" /> Enviar
            </Button>
          </div>

          {/* RIGHT: Templates tab */}
          {canUseTemplates() && (
            <div className="w-[320px] flex-shrink-0 bg-muted/20 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Templates</p>
              <p className="text-[10px] text-muted-foreground mb-1">Insertar variable:</p>
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { key: 'nombre.contacto', label: 'Nombre Contacto' },
                  { key: 'nombre.usuario', label: 'Nombre Usuario' },
                  { key: 'direccion.iglesia', label: 'Dirección Iglesia' },
                  { key: 'website.iglesia', label: 'Website Iglesia' },
                  { key: 'horarios.iglesia', label: 'Horarios Iglesia' },
                ].map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setMessage(m => m + `{${v.key}}`)}
                    className="text-[10px] px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-8 px-3">No hay plantillas guardadas. Escribí un mensaje y clickeá "Save as template" para crear una.</p>
              )}
              {templates.map(t => (
                <div 
                  key={t.id} 
                  className={`rounded-md border p-2.5 space-y-1.5 cursor-pointer hover:bg-muted/50 transition-colors ${t.is_default ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-background'}`}
                  onClick={() => setExpandedTemplateId(expandedTemplateId === t.id ? null : t.id)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      {t.is_default && <Star className="h-3 w-3 text-green-500 fill-green-500 shrink-0" />}
                      <p className="text-xs font-medium truncate">{t.name}</p>
                    </div>
                  </div>
                  <p className={`text-[10px] text-muted-foreground font-mono whitespace-pre-wrap ${expandedTemplateId === t.id ? '' : 'line-clamp-2'}`}>
                    {t.body}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-6 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectTemplate(t);
                    }}
                  >
                    Usar plantilla
                  </Button>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppComposeDialog;
export { WhatsAppIcon };
