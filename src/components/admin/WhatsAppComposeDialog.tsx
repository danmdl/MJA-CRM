"use client";
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  onSent?: (message: string) => void;
}

const WhatsAppComposeDialog = ({ open, onOpenChange, contactName, contactFirstName, contactLastName, contactPhone, onSent }: Props) => {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingBody, setEditingBody] = useState('');

  // Replace variables in template body
  const replaceVars = (body: string) => {
    return body
      .replace(/\{nombre\}/g, contactFirstName || '')
      .replace(/\{apellido\}/g, contactLastName || '')
      .replace(/\{telefono\}/g, contactPhone || '');
  };

  // Load templates
  const loadTemplates = async (autoLoadDefault = false) => {
    if (!userId) return;
    const { data } = await supabase.from('whatsapp_templates')
      .select('id, name, body, is_default')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('name');
    const list = data || [];
    setTemplates(list);
    // Auto-load default template into composer
    if (autoLoadDefault) {
      const def = list.find(t => t.is_default);
      if (def) {
        setMessage(replaceVars(def.body));
      }
    }
  };

  useEffect(() => {
    if (open) {
      setMessage('');
      setEditMode(false);
      setSaveMode(false);
      setSaveAsDefault(false);
      setEditingTemplateId(null);
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

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
    if (error) { showError('Error al eliminar.'); return; }
    showSuccess('Plantilla eliminada.');
    loadTemplates();
  };

  const handleSetDefault = async (id: string) => {
    if (!userId) return;
    await supabase.from('whatsapp_templates').update({ is_default: false }).eq('user_id', userId);
    await supabase.from('whatsapp_templates').update({ is_default: true }).eq('id', id);
    loadTemplates();
  };

  const handleStartEditTemplate = (t: WhatsAppTemplate) => {
    setEditingTemplateId(t.id);
    setEditingName(t.name);
    setEditingBody(t.body);
  };

  const handleSaveEditTemplate = async () => {
    if (!editingTemplateId || !editingName.trim() || !editingBody.trim()) return;
    const { error } = await supabase.from('whatsapp_templates')
      .update({ name: editingName.trim(), body: editingBody.trim() })
      .eq('id', editingTemplateId);
    if (error) { showError('Error al guardar.'); return; }
    showSuccess('Plantilla actualizada.');
    setEditingTemplateId(null);
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
          <div className="flex-1 p-4 flex flex-col gap-3 border-r">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensaje</label>
              <span className="text-[10px] text-muted-foreground">{message.length} caracteres</span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribí tu mensaje o seleccioná una plantilla →"
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
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => setSaveMode(true)}
                  disabled={!message.trim()}
                >
                  <Save className="h-3.5 w-3.5" /> Save as template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => setEditMode(!editMode)}
                >
                  <Edit3 className="h-3.5 w-3.5" /> {editMode ? 'Done editing' : 'Edit templates'}
                </Button>
              </div>
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
          <div className="w-[320px] flex-shrink-0 bg-muted/20 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Templates</p>
              <p className="text-[10px] text-muted-foreground mb-1">Insertar variable:</p>
              <div className="flex items-center gap-1 flex-wrap">
                {(['nombre', 'apellido', 'telefono'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMessage(m => m + `{${v}}`)}
                    className="text-[10px] px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors capitalize"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-8 px-3">No hay plantillas guardadas. Escribí un mensaje y clickeá "Save as template" para crear una.</p>
              )}
              {templates.map(t => (
                <div key={t.id} className={`rounded-md border p-2.5 space-y-1.5 ${t.is_default ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-background'}`}>
                  {editingTemplateId === t.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="Nombre"
                      />
                      <Textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        className="text-xs min-h-[60px]"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleSaveEditTemplate}>Guardar</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditingTemplateId(null)}>Cancelar</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          {t.is_default && <Star className="h-3 w-3 text-green-500 fill-green-500 shrink-0" />}
                          <p className="text-xs font-medium truncate">{t.name}</p>
                        </div>
                        {editMode && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!t.is_default && (
                              <button onClick={() => handleSetDefault(t.id)} className="p-1 hover:bg-muted rounded" title="Hacer default">
                                <Star className="h-3 w-3 text-muted-foreground" />
                              </button>
                            )}
                            <button onClick={() => handleStartEditTemplate(t)} className="p-1 hover:bg-muted rounded" title="Editar">
                              <Edit3 className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="p-1 hover:bg-red-500/10 rounded" title="Eliminar">
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{t.body}</p>
                      {!editMode && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-6 text-[10px]"
                          onClick={() => handleSelectTemplate(t)}
                        >
                          Usar plantilla
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppComposeDialog;
export { WhatsAppIcon };
