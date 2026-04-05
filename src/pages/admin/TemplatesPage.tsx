import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Plus, Star, Edit3, Trash2, Save, X } from 'lucide-react';

interface WhatsAppTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
  user_id: string;
}

const TemplatesPage = () => {
  const { session, profile } = useSession();
  const userId = session?.user?.id;
  const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario' : 'Usuario';
  const isAdmin = profile?.role === 'admin';
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingBody, setEditingBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const loadTemplates = async () => {
    if (!userId) return;
    
    let query = supabase
      .from('whatsapp_templates')
      .select('*')
      .or(`user_id.eq.${userId},is_system.eq.true`);
    
    // Filter by deleted status
    if (showTrash) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
    }
    
    const { data, error } = await query
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading templates:', error);
    }
    console.log('Loaded templates:', data);
    setTemplates(data || []);
  };

  useEffect(() => {
    loadTemplates();
  }, [userId, showTrash]);

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim() || !userId) return;
    
    if (newIsDefault) {
      await supabase.from('whatsapp_templates').update({ is_default: false }).eq('user_id', userId);
    }
    
    const { error } = await supabase.from('whatsapp_templates').insert({
      user_id: userId,
      name: newName.trim(),
      body: newBody.trim(),
      is_default: newIsDefault,
    });
    
    if (error) {
      showError('Error al crear plantilla.');
      return;
    }
    
    showSuccess(newIsDefault ? 'Plantilla creada como default.' : 'Plantilla creada.');
    setNewName('');
    setNewBody('');
    setNewIsDefault(false);
    setCreating(false);
    loadTemplates();
  };

  const handleStartEdit = (t: WhatsAppTemplate) => {
    setEditingId(t.id);
    setEditingName(t.name);
    setEditingBody(t.body);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim() || !editingBody.trim()) return;
    
    const { error } = await supabase
      .from('whatsapp_templates')
      .update({ name: editingName.trim(), body: editingBody.trim() })
      .eq('id', editingId);
    
    if (error) {
      showError('Error al guardar.');
      return;
    }
    
    showSuccess('Plantilla actualizada.');
    setEditingId(null);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Mover esta plantilla a la papelera?')) return;
    
    const { error } = await supabase
      .from('whatsapp_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) {
      showError('Error al eliminar.');
      return;
    }
    
    showSuccess('Plantilla movida a la papelera.');
    loadTemplates();
  };

  const handleRestore = async (id: string) => {
    const { error } = await supabase
      .from('whatsapp_templates')
      .update({ deleted_at: null })
      .eq('id', id);
    
    if (error) {
      showError('Error al restaurar.');
      return;
    }
    
    showSuccess('Plantilla restaurada.');
    loadTemplates();
  };

  const handlePermanentDelete = async (id: string) => {
    if (!confirm('¿Eliminar permanentemente? Esta acción no se puede deshacer.')) return;
    
    const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
    
    if (error) {
      showError('Error al eliminar permanentemente.');
      return;
    }
    
    showSuccess('Plantilla eliminada permanentemente.');
    loadTemplates();
  };

  const handleSetDefault = async (id: string) => {
    if (!userId) return;
    
    await supabase.from('whatsapp_templates').update({ is_default: false }).eq('user_id', userId);
    await supabase.from('whatsapp_templates').update({ is_default: true }).eq('id', id);
    
    showSuccess('Plantilla marcada como default.');
    loadTemplates();
  };

  const insertVariable = (variable: string) => {
    setNewBody(prev => prev + `{${variable}}`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plantillas de WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administrá tus plantillas de mensajes para WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={showTrash ? "default" : "outline"} 
            size="sm"
            onClick={() => setShowTrash(!showTrash)} 
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" /> {showTrash ? 'Ver activas' : 'Papelera'}
          </Button>
          {!showTrash && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nueva Plantilla
            </Button>
          )}
        </div>
      </div>

      {/* Create new template */}
      {creating && (
        <Card className="border-primary/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Nueva Plantilla</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs">Variables disponibles:</span>
              {[
                { key: 'nombre.contacto', label: 'Nombre Contacto' },
                { key: 'nombre.usuario', label: 'Nombre Usuario' },
                { key: 'direccion.iglesia', label: 'Dirección' },
                { key: 'website.iglesia', label: 'Website' },
                { key: 'horarios.iglesia', label: 'Horarios' },
              ].map(v => (
                <Button
                  key={v.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insertVariable(v.key)}
                  className="h-6 text-[10px] px-2 bg-primary/5 hover:bg-primary/10 border-primary/30"
                >
                  {v.label}
                </Button>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la plantilla</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder=""
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mensaje</label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder=""
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{newBody.length} caracteres</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
                className="rounded border-input"
              />
              Marcar como plantilla por defecto
            </label>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName.trim() || !newBody.trim()} className="gap-2">
                <Save className="h-4 w-4" /> Guardar
              </Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewName(''); setNewBody(''); setNewIsDefault(false); }} className="gap-2">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      <div className="space-y-3">
        {templates.length === 0 && !creating && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No tenés plantillas guardadas.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Hacé clic en "Nueva Plantilla" para crear una.
              </p>
            </CardContent>
          </Card>
        )}
        
        {templates.map((template) => {
          return (
            <Card key={template.id} className={template.is_default ? 'border-green-500/30 bg-green-500/5' : ''}>
              {editingId === template.id ? (
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nombre</label>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="Nombre de la plantilla"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mensaje</label>
                    <Textarea
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      className="min-h-[120px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">{editingBody.length} caracteres</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEdit} className="gap-2">
                      <Save className="h-4 w-4" /> Guardar
                    </Button>
                    <Button variant="outline" onClick={() => setEditingId(null)} className="gap-2">
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <div className="p-3">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {template.is_default && <Star className="h-3 w-3 text-green-500 fill-green-500 shrink-0" />}
                        <h3 className="font-semibold text-sm">{template.name}</h3>
                        {template.is_system && (
                          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[#FFC233]/15 text-[#FFC233] border border-[#FFC233]/30 uppercase tracking-wider">
                            Sistema
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Por {template.is_system ? 'Admin' : userName} · {new Date(template.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!showTrash ? (
                        <>
                          {!template.is_default && !template.is_system && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(template.id)}
                              className="h-7 w-7 p-0"
                              title="Hacer default"
                            >
                              <Star className="h-3 w-3" />
                            </Button>
                          )}
                          {(!template.is_system || isAdmin) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEdit(template)}
                                className="h-7 w-7 p-0"
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(template.id)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                title="Mover a papelera"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(template.id)}
                            className="h-7 w-7 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                            title="Restaurar"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePermanentDelete(template.id)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            title="Eliminar permanentemente"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="bg-muted/20 rounded p-2 font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-muted-foreground max-h-32 overflow-y-auto">
                    {template.body}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default TemplatesPage;
