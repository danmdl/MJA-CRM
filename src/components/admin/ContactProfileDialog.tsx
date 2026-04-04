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
import ContactLogInline from './ContactLogInline';
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
  conector?: string | null;
  observaciones?: string | null;
  pedido_de_oracion?: string | null;
  sexo?: string | null;
  estado_civil?: string | null;
  edad?: string | null;
  fecha_contacto?: string | null;
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
  role?: string | null;
  numero_cuerda?: string | null;
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
  const safeClose = () => { setShowContactMap(false); setTimeout(() => onOpenChange(false), 50); };
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { canEditDeleteContacts, canEditCuerda } = usePermissions();
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
  const [pendingCuerdaChange, setPendingCuerdaChange] = useState<string | null>(null);
  const [showContactMap, setShowContactMap] = useState(false);
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
          const leaderRoles = ['pastor', 'referente', 'encargado_de_celula', 'general', 'supervisor'];
          // Edge function doesn't return numero_cuerda, fetch it directly
          const { data: profilesData } = await supabase.from('profiles').select('id, role, numero_cuerda').eq('church_id', churchId);
          const cuerdaMap = new Map((profilesData || []).map((p: any) => [p.id, { role: p.role, numero_cuerda: p.numero_cuerda }]));
          const mapped: Leader[] = (data || [])
            .filter((u: any) => leaderRoles.includes(u.role))
            .map((u: any) => {
              const extra = cuerdaMap.get(u.id);
              return { id: u.id, first_name: u.first_name, last_name: u.last_name, role: extra?.role || u.role, numero_cuerda: extra?.numero_cuerda || null };
            });
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
            zona_id: (contact as any).zona_id || null,
            date_of_birth: contact.date_of_birth || null,
            numero_cuerda: contact.numero_cuerda || null,
            zona: contact.zona || null,
            estado_seguimiento: contact.estado_seguimiento || 'nuevo',
            observaciones: contact.observaciones || null,
            pedido_de_oracion: contact.pedido_de_oracion || null,
            lat: (contact as any).lat || null,
            lng: (contact as any).lng || null,
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
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden p-0" style={{ boxShadow: '8px 8px 0px rgba(255,194,51,0.3), 4px 4px 0px rgba(255,194,51,0.15)' }}>
        {contact && (
          <div className="flex h-full max-h-[88vh]">
            {/* LEFT: Form fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Row 1: Nombre / Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <ContactInfoField label="Nombre" value={contact.first_name} onChange={(v) => setContact({ ...contact, first_name: v })} />
                <ContactInfoField label="Apellido" value={contact.last_name || ''} onChange={(v) => setContact({ ...contact, last_name: v || null })} />
              </div>

              {/* Row 2: Teléfono */}
              <CountryPhoneInput label="Teléfono" value={contact.phone || ''} onChange={(v) => setContact({ ...contact, phone: v || null })} />

              {/* Row 3: Dirección */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dirección</label>
                <AddressAutocomplete
                  value={contact.address || ''}
                  onChange={(addr, lat, lng, barrio) => {
                    setContact(prev => ({
                      ...prev!,
                      address: addr || null,
                      ...(lat != null ? { lat } : {}),
                      ...(lng != null ? { lng } : {}),
                      ...(barrio ? { barrio } : {}),
                    } as any));
                  }}
                  placeholder="Escribe la dirección..."
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    onClick={() => setShowContactMap(!showContactMap)}
                  >
                    <MapPin className="h-3 w-3" /> {showContactMap ? 'Ocultar mapa' : 'Ubicar en Mapa'}
                  </button>
                  {(contact as any).lat != null && (contact as any).lng != null && (
                    <span className="text-[10px] text-muted-foreground">({(contact as any).lat.toFixed(4)}, {(contact as any).lng.toFixed(4)})</span>
                  )}
                </div>
                {showContactMap && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Hacé clic en el mapa o arrastrá el pin para ubicar al contacto.</p>
                    <div
                      ref={(el) => {
                        if (!el || !(window as any).google) return;
                        const google = (window as any).google;
                        const cLat = (contact as any).lat;
                        const cLng = (contact as any).lng;
                        const center = cLat != null && cLng != null
                          ? { lat: cLat, lng: cLng }
                          : { lat: -34.58, lng: -58.52 };
                        const map = new google.maps.Map(el, {
                          center, zoom: cLat != null ? 16 : 13,
                          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
                        });
                        const marker = new google.maps.Marker({ position: center, map, draggable: true });
                        const updateFromLatLng = (lat: number, lng: number) => {
                          const geocoder = new google.maps.Geocoder();
                          geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                            const addr = status === 'OK' && results?.[0] ? results[0].formatted_address : contact.address;
                            setContact(prev => ({ ...prev!, address: addr, lat, lng } as any));
                          });
                        };
                        map.addListener('click', (e: any) => {
                          marker.setPosition(e.latLng);
                          updateFromLatLng(e.latLng.lat(), e.latLng.lng());
                        });
                        marker.addListener('dragend', () => {
                          const pos = marker.getPosition();
                          updateFromLatLng(pos.lat(), pos.lng());
                        });
                      }}
                      className="w-full h-[200px] rounded border"
                    />
                  </div>
                )}
              </div>

              {/* Row 4: Apartamento / Barrio */}
              <div className="grid grid-cols-2 gap-4">
                <ContactInfoField label="Número de Apartamento" value={contact.apartment_number || ''} onChange={(v) => setContact({ ...contact, apartment_number: v || null })} icon={Home} />
                <ContactInfoField label="Barrio" value={contact.barrio || ''} onChange={(v) => setContact({ ...contact, barrio: v || null })} />
              </div>

              {/* Row 5: Cuerda / Zona / Fecha nacimiento */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cuerda</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={contact.numero_cuerda || 'Sin cuerda'} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-default" />
                    {canEditCuerda() && (
                      <Button type="button" variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={() => setPendingCuerdaChange('__open__')}>
                        Editar
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zona</label>
                  <input readOnly value={contact.zona || ''} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-default" placeholder="Se completa al elegir cuerda" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha de nacimiento</label>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={contact.date_of_birth || ''} onChange={(e) => setContact({ ...contact, date_of_birth: e.target.value || null })} className="flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {(() => { if (!contact.date_of_birth) return ''; const d = new Date(contact.date_of_birth!); const age = Math.abs(new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970); return Number.isFinite(age) ? `${age}a` : ''; })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 6: Estado / Célula / Líder */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={contact.estado_seguimiento || 'nuevo'} onChange={(e) => setContact({ ...contact, estado_seguimiento: e.target.value })}>
                    {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Célula</label>
                  <Select value={contact.cell_id || undefined} onValueChange={(v) => {
                    const cell = cells.find(c => c.id === v);
                    setContact({ ...contact, cell_id: v });
                    if (cell) { setWhatsappMsg(DEFAULT_WHATSAPP_TEMPLATE(`${contact.first_name} ${contact.last_name || ''}`.trim(), cell.name, cell.meeting_day || 'TBD', cell.meeting_time || 'TBD', cell.address || '')); setWhatsappCell(cell); }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Sin célula" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin célula</SelectItem>
                      {cells.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <SelectField label="Líder de Célula" value={contact.leader_assigned} onChange={(v) => setContact({ ...contact, leader_assigned: v })} options={leaders.map(l => ({ id: l.id, name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Sin nombre' }))} placeholder="Sin líder" />
              </div>

              {/* Referente (readonly — resolved from cuerda) */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Referente de Cuerda</label>
                <input readOnly value={(() => {
                  if (!contact.numero_cuerda || !leaders?.length) return '—';
                  const ref = leaders.find(l => l.numero_cuerda === contact.numero_cuerda && (l.role === 'referente' || l.role === 'supervisor'));
                  return ref ? `${ref.first_name || ''} ${ref.last_name || ''}`.trim() || '—' : '—';
                })()} className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground cursor-default" />
              </div>

              {/* Observaciones / Pedido de oración */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observaciones</label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={contact.observaciones || ''}
                    onChange={(e) => setContact({ ...contact, observaciones: e.target.value || null })}
                    placeholder="Notas adicionales..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pedido de Oración</label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={contact.pedido_de_oracion || ''}
                    onChange={(e) => setContact({ ...contact, pedido_de_oracion: e.target.value || null })}
                    placeholder="¿Tiene algún pedido de oración?"
                  />
                </div>
              </div>

              {/* WhatsApp invite */}
              {whatsappCell && contact.cell_id === whatsappCell.id && (
                <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-400"><Send className="h-4 w-4" /> ¿Avisar a {contact.first_name} por WhatsApp?</div>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditingTemplate(v => !v)}>{editingTemplate ? 'Cerrar' : 'Editar'}</button>
                  </div>
                  {editingTemplate && <Textarea value={whatsappMsg} onChange={e => setWhatsappMsg(e.target.value)} className="text-xs min-h-[80px] font-mono" />}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="gap-1.5 text-xs" onClick={() => { window.open(`https://wa.me/${(contact.phone || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(whatsappMsg)}`, '_blank'); }} disabled={!contact.phone}><MessageSquare className="h-3.5 w-3.5" /> Enviar</Button>
                    <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setWhatsappCell(null)}>No ahora</Button>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
                <Button size="sm" variant="outline" onClick={() => setAddLogOpen(true)}><MessageSquare className="mr-1.5 h-4 w-4" /> Agregar Registro</Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => safeClose()} disabled={saving}>Cancelar</Button>
                {(canEditDeleteContacts() || profile?.role === 'conector') && <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</Button>}
              </div>

              {/* Hidden dialogs */}
              <AddContactLogDialog open={addLogOpen} onOpenChange={setAddLogOpen} churchId={churchId} contactId={contact.id} onAdded={() => { setLogOpen(true); setHistorySignal(s => s + 1); }} />
              <ContactLogDialog open={logOpen} onOpenChange={setLogOpen} churchId={churchId} contactId={contact.id} refreshSignal={historySignal} />

              {/* Cuerda change dialog */}
              <Dialog open={!!pendingCuerdaChange} onOpenChange={(o) => { if (!o) setPendingCuerdaChange(null); }}>
                <DialogContent className="sm:max-w-[450px]">
                  <DialogHeader>
                    <DialogTitle>Cambiar número de cuerda</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Cuerda actual: <strong>{contact.numero_cuerda || 'Sin cuerda'}</strong>
                      {contact.zona && <> · Zona {contact.zona}</>}
                    </p>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Nueva cuerda</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={pendingCuerdaChange === '__open__' ? '' : (pendingCuerdaChange || '')}
                        onChange={(e) => setPendingCuerdaChange(e.target.value || '__open__')}
                      >
                        <option value="">Seleccionar cuerda...</option>
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

                    {/* Warning: non-privileged roles return contact to Semillero */}
                    {!(profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor') && (contact.cell_id || (contact as any).zona_id) && (
                      <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/5 text-sm">
                        <p>Para editar el número de cuerda, este contacto se devolverá al <strong>Semillero Sin Asignar</strong> de la cuerda original ({contact.numero_cuerda}).</p>
                        <p className="text-xs text-muted-foreground mt-1">Desde ahí podrás asignarle una nueva cuerda o célula.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPendingCuerdaChange(null)}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={!pendingCuerdaChange || pendingCuerdaChange === '__open__'}
                      onClick={() => {
                        const newCuerda = pendingCuerdaChange!;
                        const zonaMap: Record<string, string> = {
                          '101': 'San Martín', '201': 'San Martín', '102': 'Villa Lynch', '202': 'Villa Lynch',
                          '103': 'Ballester', '203': 'Ballester', '110': 'Gregoria Matorras', '210': 'Gregoria Matorras',
                          '104': 'Villa Maipú', '204': 'Villa Maipú', '105': 'Loma Hermosa', '205': 'Loma Hermosa',
                          '106': 'Jose L. Suarez', '206': 'Jose L. Suarez', '107': 'Santos Lugares', '207': 'Santos Lugares',
                          '108': 'Billinghurst', '208': 'Billinghurst', '109': 'Caseros', '209': 'Caseros',
                          '301': 'Bonich', '302': 'Bonich',
                        };
                        const isPrivileged = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor';
                        if (isPrivileged) {
                          // Privileged: change cuerda directly without returning to Semillero
                          setContact({ ...contact, numero_cuerda: newCuerda, zona: zonaMap[newCuerda] || null });
                        } else {
                          // Non-privileged: clear cell/zona, return to Semillero
                          setContact({ ...contact, numero_cuerda: newCuerda, zona: zonaMap[newCuerda] || null, cell_id: null } as any);
                        }
                        setPendingCuerdaChange(null);
                      }}
                    >
                      {(profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor')
                        ? 'Cambiar cuerda'
                        : 'Devolver al Semillero y cambiar'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* RIGHT: Sidebar — Registros (top) + Historial (bottom) */}
            <div className="w-[320px] flex-shrink-0 border-l border-border bg-muted/30 flex flex-col overflow-hidden">
              {/* Top half: Contact logs */}
              <div className="flex-1 overflow-y-auto p-4 border-b border-border">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Registros de contacto</p>
                <ContactLogInline churchId={churchId} contactId={contact.id} refreshSignal={historySignal} />
              </div>
              {/* Bottom half: Timeline */}
              <div className="flex-1 overflow-y-auto p-4">
                <UnifiedTimeline contactId={contact.id} churchId={churchId} transfers={transfers} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactProfileDialog;