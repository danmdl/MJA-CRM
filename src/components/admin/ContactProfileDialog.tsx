"use client";

import React, { useState, useEffect } from 'react';
import { usePermissions } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { User, Mail, MapPin, Home, Calendar, MessageSquare, ClipboardList, Send } from 'lucide-react';
import { logger } from '@/utils/logger';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/hooks/use-session';
import CountryPhoneInput from '@/components/CountryPhoneInput';
import ContactLogDialog from './ContactLogDialog';
import AddContactLogDialog from './AddContactLogDialog';
import UnifiedTimeline from './UnifiedTimeline';
import { PIPELINE_STAGES } from './ContactPipelineBadge';
import AddressAutocomplete from './AddressAutocomplete';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  apartment_number: string | null;
  barrio: string | null;
  leader_assigned: string | null;
  created_at: string;
  church_id: string;
  cell_id: string | null;
  date_of_birth?: string | null;
  numero_cuerda?: string | null;
  zona?: string | null;
  estado_seguimiento?: string | null;
}

interface ContactLog {
  id: string;
  contact_id: string;
  contacted_by: string | null;
  contact_date: string;
  contact_method: string | null;
  notes: string | null;
  created_at: string;
  contacted_by_name?: string;
}

interface Leader {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Cell {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  meeting_day?: string | null;
  meeting_time?: string | null;
}

// Haversine distance in km


const DEFAULT_WHATSAPP_TEMPLATE = (contactName: string, cellName: string, day: string, time: string, address: string) =>
  `Hola ${contactName}! 👋\n\nTe queremos invitar a la célula *${cellName}* que se reúne los *${day}* a las *${time}* en ${address}.\n\n¡Esperamos verte pronto! 🙏`;

interface ContactProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  churchId: string;
}

const ProfilePictureSection = ({ contact }: { contact: Contact }) => (
  <div className="flex flex-col items-start space-y-4">
    <div className="relative">
      <div className="bg-gray-200 border-2 border-dashed rounded-xl w-24 h-24 flex items-center justify-center">
        <User className="h-12 w-12 text-gray-400" />
      </div>
      <Button size="sm" className="absolute -bottom-2 left-1/2 transform -translate-x-1/2" variant="outline">
        Cambiar Foto
      </Button>
    </div>
    {/* Name moved to the top-right section area below selects */}
  </div>
);

const ContactInfoField = ({
  label,
  value,
  onChange,
  icon: Icon,
  type = "text",
  placeholder = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ComponentType<{ className: string }>;
  type?: string;
  placeholder?: string;
}) => (
  <div className="space-y-2">
    <Label htmlFor={label.toLowerCase().replace(/\s/g, '-')}>{label}</Label>
    {Icon ? (
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          id={label.toLowerCase().replace(/\s/g, '-')}
          type={type}
          className="pl-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    ) : (
      <Input
        id={label.toLowerCase().replace(/\s/g, '-')}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )}
  </div>
);

const SelectField = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ id: string; name: string }>;
  placeholder: string;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor={label.toLowerCase().replace(/\s/g, '-')}>{label}</Label>
    <Select
      value={value || undefined}
      onValueChange={(v) => onChange(v === 'none' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sin asignación</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const ContactLogsTable = ({ logs }: { logs: ContactLog[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-32">Fecha</TableHead>
        <TableHead className="w-32">Método</TableHead>
        <TableHead>Notas</TableHead>
        <TableHead className="w-32">Registrado por</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {logs.map((log) => (
        <TableRow key={log.id}>
          <TableCell>
            {format(new Date(log.contact_date), "d 'de' MMM yyyy", { locale: es })}
          </TableCell>
          <TableCell>{log.contact_method || '-'}</TableCell>
          <TableCell>{log.notes || '-'}</TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {log.contacted_by_name}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const ContactProfileDialog = ({ open, onOpenChange, contactId, churchId }: ContactProfileDialogProps) => {
  const safeClose = () => setTimeout(() => onOpenChange(false), 50);
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { canEditDeleteContacts } = usePermissions();
  const { profile } = useSession();
  const [newLog, setNewLog] = useState({ date: '', method: '', notes: '' });
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [historySignal, setHistorySignal] = useState(0);
  const [transfers, setTransfers] = useState<any[]>([]);
  const queryClient = useQueryClient();
  const { session } = useSession();

  // Cell suggestion state
  const [whatsappCell, setWhatsappCell] = useState<Cell | null>(null);
  const [whatsappMsg, setWhatsappMsg] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(false);

  useEffect(() => {
    if (open && contactId) {
      fetchContactDetails();
      fetchContactLogs();
      fetchLeadersAndCells();
      fetchTransfers();
    }
  }, [open, contactId]);

  const fetchTransfers = async () => {
    if (!contactId) return;
    const { data } = await supabase
      .from('contact_transfers')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setTransfers(data || []);
  };

  const fetchContactDetails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('church_id', churchId)
      .single();
    if (!error) setContact(data as unknown as Contact);
    setLoading(false);
  };

  const fetchContactLogs = async () => {
    if (!contactId) return;
    const { data, error } = await supabase
      .from('contact_logs')
      .select(`
        *,
        contacted_by_profile:profiles(first_name, last_name)
      `)
      .eq('contact_id', contactId)
      .order('contact_date', { ascending: false });
    if (!error) {
      const logs = (data || []).map((log: any) => ({
        ...log,
        contacted_by_name: log.contacted_by_profile
          ? `${log.contacted_by_profile.first_name} ${log.contacted_by_profile.last_name}`
          : 'Desconocido'
      }));
      setContactLogs(logs);
    }
  };

  const fetchLeadersAndCells = async () => {
    try {
      if (session?.access_token) {
        const resp = await fetch(`https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'listChurchUsers', churchId }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const leaderRoles = ['pastor', 'referente', 'encargado_de_celula', 'general'];
          const mapped: Leader[] = (data || [])
            .filter((u: any) => leaderRoles.includes(u.role))
            .map((u: any) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name }));
          setLeaders(mapped);
        } else {
          setLeaders([]);
        }
      } else {
        setLeaders([]);
      }
    } catch {
      setLeaders([]);
    }

    const { data: cellsData } = await supabase
      .from('cells')
      .select('id, name, lat, lng, address, meeting_day, meeting_time')
      .eq('church_id', churchId)
      .order('name', { ascending: true });
    setCells(cellsData || []);
  };




  const handleSave = async () => {
    if (!contact) return;
    setSaving(true);
    // Guardar en backend (Edge Function)
    try {
      const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/update-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          contactId: contact.id,
          churchId,
          data: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
            apartment_number: contact.apartment_number,
            barrio: contact.barrio,
            leader_assigned: contact.leader_assigned,
            cell_id: contact.cell_id,
            date_of_birth: contact.date_of_birth || null,
            numero_cuerda: contact.numero_cuerda || null,
            zona: contact.zona || null,
            estado_seguimiento: contact.estado_seguimiento || 'nuevo',
          }
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showError(err.error || 'Error al actualizar el contacto.');
      } else {
        showSuccess('Contacto actualizado con éxito.');
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        safeClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddLog = async () => {
    if (!contactId || !newLog.date) return;
    const { data, error } = await supabase
      .from('contact_logs')
      .insert({
        contact_id: contactId,
        contacted_by: (await supabase.auth.getUser()).data.user?.id,
        contact_date: newLog.date,
        contact_method: newLog.method,
        notes: newLog.notes,
      })
      .select(`
        *,
        contacted_by_profile:profiles(first_name, last_name)
      `)
      .single();
    if (!error && data) {
      const logWithContactedByName = {
        ...data,
        contacted_by_name: data.contacted_by_profile
          ? `${data.contacted_by_profile.first_name} ${data.contacted_by_profile.last_name}`
          : 'Desconocido'
      };
      setContactLogs([logWithContactedByName, ...contactLogs]);
      setNewLog({ date: '', method: '', notes: '' });
      showSuccess('Registro de contacto agregado con éxito.');
    } else {
      showError('Error al agregar el registro de contacto.');
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) safeClose(); else onOpenChange(true); }}>
        <DialogContent>
          <div className="flex items-center justify-center h-32">
            <div>Cargando contacto...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) safeClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto" style={{ boxShadow: '8px 8px 0px rgba(255,194,51,0.3), 4px 4px 0px rgba(255,194,51,0.15)' }}>
        <DialogHeader>
          <DialogTitle className="text-xl">Perfil del Contacto</DialogTitle>
          {contact && (contact.numero_cuerda || contact.zona) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {contact.numero_cuerda && `Cuerda ${contact.numero_cuerda}`}
              {contact.numero_cuerda && contact.zona && ' · '}
              {contact.zona && `Zona ${contact.zona}`}
            </p>
          )}
        </DialogHeader>
        {contact && (
          <div className="space-y-5 mt-1">
            {/* Divider */}
            <div className="border-t border-border" />

            {/* Row 1: Nombre / Apellido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ContactInfoField label="Nombre" value={contact.first_name} onChange={(v) => setContact({ ...contact, first_name: v })} />
              <ContactInfoField label="Apellido" value={contact.last_name || ''} onChange={(v) => setContact({ ...contact, last_name: v || null })} />
            </div>

            {/* Row 2: Teléfono */}
            <CountryPhoneInput label="Teléfono" value={contact.phone || ''} onChange={(v) => setContact({ ...contact, phone: v || null })} />

            {/* Row 3: Dirección (full width) */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dirección</label>
              <AddressAutocomplete
                value={contact.address || ''}
                onChange={(addr, lat, lng, barrio) => setContact(prev => ({ ...prev!, address: addr || null, ...(barrio ? { barrio } : {}) }))}
                placeholder="Escribe la dirección para buscar y confirmar..."
              />
            </div>

            {/* Row 4: Apartamento / Barrio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ContactInfoField label="Número de Apartamento" value={contact.apartment_number || ''} onChange={(v) => setContact({ ...contact, apartment_number: v || null })} icon={Home} />
              <ContactInfoField label="Barrio" value={contact.barrio || ''} onChange={(v) => setContact({ ...contact, barrio: v || null })} />
            </div>

            {/* Row 5: Cuerda / Zona / Fecha nacimiento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Número de Cuerda</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={contact.numero_cuerda || ''}
                  onChange={(e) => {
                    const cuerda = e.target.value;
                    const zonaMap: Record<string, string> = {
                      '101': 'San Martín', '201': 'San Martín',
                      '102': 'Villa Lynch', '202': 'Villa Lynch',
                      '103': 'Ballester', '203': 'Ballester',
                      '110': 'Gregoria Matorras', '210': 'Gregoria Matorras',
                      '104': 'Villa Maipú', '204': 'Villa Maipú',
                      '105': 'Loma Hermosa', '205': 'Loma Hermosa',
                      '106': 'Jose L. Suarez', '206': 'Jose L. Suarez',
                      '107': 'Santos Lugares', '207': 'Santos Lugares',
                      '108': 'Billinghurst', '208': 'Billinghurst',
                      '109': 'Caseros', '209': 'Caseros',
                      '301': 'Bonich', '302': 'Bonich',
                    };
                    setContact({ ...contact, numero_cuerda: cuerda || null, zona: zonaMap[cuerda] || contact.zona || null });
                  }}
                >
                  <option value="">Sin cuerda</option>
                  <optgroup label="San Martín"><option value="101">101</option><option value="201">201</option></optgroup>
                  <optgroup label="Villa Lynch"><option value="102">102</option><option value="202">202</option></optgroup>
                  <optgroup label="Ballester"><option value="103">103</option><option value="203">203</option></optgroup>
                  <optgroup label="Gregoria Matorras"><option value="110">110</option><option value="210">210</option></optgroup>
                  <optgroup label="Villa Maipú"><option value="104">104</option><option value="204">204</option></optgroup>
                  <optgroup label="Loma Hermosa"><option value="105">105</option><option value="205">205</option></optgroup>
                  <optgroup label="Jose L. Suarez"><option value="106">106</option><option value="206">206</option></optgroup>
                  <optgroup label="Santos Lugares"><option value="107">107</option><option value="207">207</option></optgroup>
                  <optgroup label="Billinghurst"><option value="108">108</option><option value="208">208</option></optgroup>
                  <optgroup label="Caseros"><option value="109">109</option><option value="209">209</option></optgroup>
                  <optgroup label="Bonich"><option value="301">301</option><option value="302">302</option></optgroup>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zona</label>
                <input
                  readOnly
                  value={contact.zona || ''}
                  className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-default"
                  placeholder="Se completa al elegir cuerda"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha de nacimiento</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={contact.date_of_birth || ''}
                    onChange={(e) => setContact({ ...contact, date_of_birth: e.target.value || null })}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {(() => {
                      if (!contact.date_of_birth) return '';
                      const d = new Date(contact.date_of_birth!);
                      const diff = Date.now() - d.getTime();
                      const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
                      return Number.isFinite(age) ? `${age} años` : '';
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 6: Estado / Célula / Líder */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado de seguimiento</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={contact.estado_seguimiento || 'nuevo'}
                  onChange={(e) => setContact({ ...contact, estado_seguimiento: e.target.value })}
                >
                  {PIPELINE_STAGES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Célula</label>
                <Select
                  value={contact.cell_id || undefined}
                  onValueChange={(v) => {
                    const cell = cells.find(c => c.id === v);
                    setContact({ ...contact, cell_id: v });
                    if (cell) {
                      const name = `${contact.first_name} ${contact.last_name || ''}`.trim();
                      setWhatsappMsg(DEFAULT_WHATSAPP_TEMPLATE(name, cell.name, cell.meeting_day || 'TBD', cell.meeting_time || 'TBD', cell.address || ''));
                      setWhatsappCell(cell);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Sin célula" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin célula</SelectItem>
                    {cells.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <SelectField
                label="Líder de Célula"
                value={contact.leader_assigned}
                onChange={(v) => setContact({ ...contact, leader_assigned: v })}
                options={leaders.map(l => ({ id: l.id, name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Sin nombre' }))}
                placeholder="Sin líder asignado"
              />
            </div>

            {/* WhatsApp invite after assignment */}
            {whatsappCell && contact.cell_id === whatsappCell.id && (
              <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                    <Send className="h-4 w-4" />
                    ¿Avisar a {contact.first_name} por WhatsApp?
                  </div>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditingTemplate(v => !v)}>
                    {editingTemplate ? 'Cerrar edición' : 'Editar mensaje'}
                  </button>
                </div>
                {editingTemplate && (
                  <Textarea value={whatsappMsg} onChange={e => setWhatsappMsg(e.target.value)} className="text-xs min-h-[100px] font-mono" />
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="gap-1.5 text-xs" onClick={() => { const phone = (contact.phone || '').replace(/[^\d]/g, ''); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`, '_blank'); }} disabled={!contact.phone}>
                    <MessageSquare className="h-3.5 w-3.5" /> Enviar WhatsApp
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setWhatsappCell(null)}>No por ahora</Button>
                </div>
                {!contact.phone && <p className="text-xs text-amber-400">El contacto no tiene teléfono registrado.</p>}
              </div>
            )}

            {/* Buttons row */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" variant="outline" onClick={() => setAddLogOpen(true)}>
                <MessageSquare className="mr-1.5 h-4 w-4" /> Agregar Registro
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
                <ClipboardList className="mr-1.5 h-4 w-4" /> Ver Historial
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => safeClose()} disabled={saving}>Cancelar</Button>
              {(canEditDeleteContacts() || profile?.role === 'conector') && <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</Button>}
            </div>

            <AddContactLogDialog
              open={addLogOpen}
              onOpenChange={(o) => {
                setAddLogOpen(o);
              }}
              churchId={churchId}
              contactId={contact.id}
              onAdded={() => {
                setLogOpen(true);
                setHistorySignal((s) => s + 1);
              }}
            />
            <ContactLogDialog
              open={logOpen}
              onOpenChange={setLogOpen}
              churchId={churchId}
              contactId={contact.id}
              refreshSignal={historySignal}
            />

            {/* Unified Timeline */}
            {(transfers.length > 0 || true) && (
              <UnifiedTimeline contactId={contact.id} churchId={churchId} transfers={transfers} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactProfileDialog;