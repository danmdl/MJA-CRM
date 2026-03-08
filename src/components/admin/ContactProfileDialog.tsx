"use client";

import React, { useState, useEffect } from 'react';
import { usePermissions } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { User, Mail, MapPin, Home, Calendar, MessageSquare, ClipboardList } from 'lucide-react';
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
}

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
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { canEditDeleteUsers } = usePermissions();
  const [newLog, setNewLog] = useState({ date: '', method: '', notes: '' });
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [historySignal, setHistorySignal] = useState(0);
  const queryClient = useQueryClient();
  const { session } = useSession();

  useEffect(() => {
    if (open && contactId) {
      fetchContactDetails();
      fetchContactLogs();
      fetchLeadersAndCells();
    }
  }, [open, contactId]);

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
          const leaderRoles = ['pastor', 'piloto', 'encargado_de_celula', 'general'];
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
      .select('id, name')
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
          }
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showError(err.error || 'Error al actualizar el contacto.');
      } else {
        showSuccess('Contacto actualizado con éxito.');
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        onOpenChange(false);
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center h-32">
            <div>Cargando contacto...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil del Contacto</DialogTitle>
        </DialogHeader>
        {contact && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <ProfilePictureSection contact={contact} />
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SelectField
                    label="Célula"
                    value={contact.cell_id}
                    onChange={(v) => setContact({ ...contact, cell_id: v })}
                    options={cells}
                    placeholder="Sin célula asignada"
                  />
                  <SelectField
                    label="Referente asignado"
                    value={contact.leader_assigned}
                    onChange={(v) => setContact({ ...contact, leader_assigned: v })}
                    options={leaders.map(l => ({ id: l.id, name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Sin nombre' }))}
                    placeholder="Sin referente asignado"
                  />
                </div>
                {/* Full name in one line just below the selects */}
                <div className="mt-3 text-lg font-semibold">
                  {`${contact.first_name} ${contact.last_name || ''}`.trim()}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ContactInfoField label="Nombre" value={contact.first_name} onChange={(v) => setContact({ ...contact, first_name: v })} />
                <ContactInfoField label="Apellido" value={contact.last_name || ''} onChange={(v) => setContact({ ...contact, last_name: v || null })} />
              </div>
              <CountryPhoneInput label="Teléfono" value={contact.phone || ''} onChange={(v) => setContact({ ...contact, phone: v || null })} />
              <ContactInfoField label="Dirección" value={contact.address || ''} onChange={(v) => setContact({ ...contact, address: v || null })} icon={MapPin} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ContactInfoField label="Número de Apartamento" value={contact.apartment_number || ''} onChange={(v) => setContact({ ...contact, apartment_number: v || null })} icon={Home} />
                <ContactInfoField label="Barrio" value={contact.barrio || ''} onChange={(v) => setContact({ ...contact, barrio: v || null })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fecha-nacimiento">Fecha de nacimiento</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="fecha-nacimiento"
                      type="date"
                      value={contact.date_of_birth || ''}
                      onChange={(e) => setContact({ ...contact, date_of_birth: e.target.value || null })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {(() => {
                        if (!contact.date_of_birth) return 'Edad: -';
                        const d = new Date(contact.date_of_birth!);
                        const diff = Date.now() - d.getTime();
                        const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
                        return `Edad: ${Number.isFinite(age) ? age : '-'}`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <Button size="sm" onClick={() => setAddLogOpen(true)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Agregar Registro
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setLogOpen(true)}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Ver historial de registro
              </Button>
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

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              {canEditDeleteUsers() && <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactProfileDialog;