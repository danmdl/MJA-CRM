"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { User, Mail, Phone, MapPin, Home, Users, Calendar, MessageSquare } from 'lucide-react';
import { logger } from '@/utils/logger';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DebugLeaders from './DebugLeaders';

// Interfaces
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
  notes?: string | null;
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
  first_name: string;
  last_name: string;
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

// Componentes modulares
const ProfilePictureSection = ({ contact }: { contact: Contact }) => (
  <div className="flex flex-col items-center space-y-4">
    <div className="relative">
      <div className="bg-gray-200 border-2 border-dashed rounded-xl w-24 h-24 flex items-center justify-center">
        <User className="h-12 w-12 text-gray-400" />
      </div>
      <Button size="sm" className="absolute -bottom-2 left-1/2 transform -translate-x-1/2" variant="outline">
        Cambiar Foto
      </Button>
    </div>
    <h2 className="text-xl font-bold">
      {contact.first_name} {contact.last_name || ''}
    </h2>
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
    {Icon && (
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input 
          id={label.toLowerCase().replace(/\s/g, '-')} 
          type={type} 
          className="pl-10" 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          placeholder={placeholder} 
        />
      </div>
    )}
    {!Icon && (
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
      onValueChange={(value) => onChange(value === "none" ? null : value)} 
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

const ContactLogForm = ({ 
  newLog, 
  setNewLog, 
  onAddLog 
}: { 
  newLog: { date: string; method: string; notes: string }; 
  setNewLog: React.Dispatch<React.SetStateAction<{ date: string; method: string; notes: string }>>; 
  onAddLog: () => void; 
}) => (
  <div className="space-y-3 p-3 bg-muted rounded-md">
    <h4 className="font-medium">Agregar Nuevo Registro</h4>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <div>
        <Label htmlFor="logDate" className="text-xs">Fecha</Label>
        <Input 
          id="logDate" 
          type="date" 
          value={newLog.date} 
          onChange={(e) => setNewLog({ ...newLog, date: e.target.value })} 
        />
      </div>
      <div>
        <Label htmlFor="logMethod" className="text-xs">Método</Label>
        <Input 
          id="logMethod" 
          placeholder="Llamada, WhatsApp, etc." 
          value={newLog.method} 
          onChange={(e) => setNewLog({ ...newLog, method: e.target.value })} 
        />
      </div>
      <div>
        <Label htmlFor="logNotes" className="text-xs">Notas</Label>
        <Input 
          id="logNotes" 
          placeholder="Detalles del contacto" 
          value={newLog.notes} 
          onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })} 
        />
      </div>
    </div>
    <Button size="sm" onClick={onAddLog} disabled={!newLog.date}>
      <MessageSquare className="mr-2 h-4 w-4" />
      Agregar Registro
    </Button>
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

// Componente principal
const ContactProfileDialog = ({ open, onOpenChange, contactId, churchId }: ContactProfileDialogProps) => {
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLog, setNewLog] = useState({ date: '', method: '', notes: '' });
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const queryClient = useQueryClient();

  // Fetch contact details when dialog opens or contactId changes
  useEffect(() => {
    if (open && contactId) {
      console.log(`[ContactProfileDialog] Opening dialog for contactId: ${contactId}, churchId: ${churchId}`);
      fetchContactDetails();
      fetchContactLogs();
      fetchLeadersAndCells();
    }
  }, [open, contactId]);

  const fetchContactDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('church_id', churchId)
        .single();

      if (error) {
        logger.error('Error fetching contact details', error);
        showError('Error al cargar los detalles del contacto.');
      } else {
        setContact(data);
      }
    } catch (error: any) {
      logger.error('Unexpected error fetching contact', error);
      showError('Error inesperado al cargar el contacto.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContactLogs = async () => {
    if (!contactId) return;
    try {
      const { data, error } = await supabase
        .from('contact_logs')
        .select(`
          *,
          contacted_by_profile:profiles(first_name, last_name)
        `)
        .eq('contact_id', contactId)
        .order('contact_date', { ascending: false });

      if (error) {
        logger.error('Error fetching contact logs', error);
        showError('Error al cargar el historial de contactos.');
      } else {
        // Map the data to include contacted_by_name
        const logs = data.map(log => ({
          ...log,
          contacted_by_name: log.contacted_by_profile ? 
            `${log.contacted_by_profile.first_name} ${log.contacted_by_profile.last_name}` : 
            'Desconocido'
        }));
        setContactLogs(logs);
      }
    } catch (error: any) {
      logger.error('Unexpected error fetching contact logs', error);
      showError('Error inesperado al cargar el historial de contactos.');
    }
  };

  const fetchLeadersAndCells = async () => {
    try {
      console.log(`[ContactProfileDialog] Fetching leaders and cells for churchId: ${churchId}`);

      // Fetch all profiles for debugging
      const { data: allProfiles, error: allProfilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('church_id', churchId);

      console.log(`[ContactProfileDialog] All profiles for church:`, allProfiles, allProfilesError);

      // Fetch leaders (all roles that could be leaders)
      const { data: leadersData, error: leadersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('church_id', churchId)
        .in('role', ['pastor', 'piloto', 'encargado_de_celula', 'general']) // Include all potential leader roles
        .order('first_name', { ascending: true });

      if (leadersError) {
        logger.error('Error fetching leaders', leadersError);
        console.error('Error fetching leaders:', leadersError);
      } else {
        console.log(`[ContactProfileDialog] Leaders fetched:`, leadersData);
        setLeaders(leadersData || []);
      }

      // Fetch cells
      const { data: cellsData, error: cellsError } = await supabase
        .from('cells')
        .select('id, name')
        .eq('church_id', churchId)
        .order('name', { ascending: true });

      if (cellsError) {
        logger.error('Error fetching cells', cellsError);
        console.error('Error fetching cells:', cellsError);
      } else {
        console.log(`[ContactProfileDialog] Cells fetched:`, cellsData);
        setCells(cellsData || []);
      }
    } catch (error: any) {
      logger.error('Unexpected error fetching leaders and cells', error);
      console.error('Unexpected error fetching leaders and cells:', error);
    }
  };

  const handleSave = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          apartment_number: contact.apartment_number,
          barrio: contact.barrio,
          leader_assigned: contact.leader_assigned,
          cell_id: contact.cell_id,
          notes: contact.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id)
        .eq('church_id', churchId);

      if (error) {
        logger.error('Error updating contact', error);
        showError('Error al actualizar el contacto.');
      } else {
        showSuccess('Contacto actualizado con éxito.');
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        onOpenChange(false);
      }
    } catch (error: any) {
      logger.error('Unexpected error updating contact', error);
      showError('Error inesperado al actualizar el contacto.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLog = async () => {
    if (!contactId || !newLog.date) return;
    try {
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

      if (error) {
        logger.error('Error adding contact log', error);
        showError('Error al agregar el registro de contacto.');
      } else {
        // Add the new log to the list
        const logWithContactedByName = {
          ...data,
          contacted_by_name: data.contacted_by_profile ? 
            `${data.contacted_by_profile.first_name} ${data.contacted_by_profile.last_name}` : 
            'Desconocido'
        };
        setContactLogs([logWithContactedByName, ...contactLogs]);
        setNewLog({ date: '', method: '', notes: '' });
        showSuccess('Registro de contacto agregado con éxito.');
      }
    } catch (error: any) {
      logger.error('Unexpected error adding contact log', error);
      showError('Error inesperado al agregar el registro de contacto.');
    }
  };

  const handleChange = (field: keyof Contact, value: string | null) => {
    if (contact) {
      setContact({ ...contact, [field]: value });
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
          <div className="space-y-6">
            {/* Debug info */}
            <DebugLeaders churchId={churchId} />
            
            {/* Profile Picture Section */}
            <ProfilePictureSection contact={contact} />

            {/* Contact Information */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ContactInfoField 
                  label="Nombre" 
                  value={contact.first_name} 
                  onChange={(value) => handleChange('first_name', value)} 
                />
                <ContactInfoField 
                  label="Apellido" 
                  value={contact.last_name || ''} 
                  onChange={(value) => handleChange('last_name', value || null)} 
                />
              </div>
              <ContactInfoField 
                label="Correo Electrónico" 
                value={contact.email || ''} 
                onChange={(value) => handleChange('email', value || null)} 
                icon={Mail} 
                type="email" 
              />
              <ContactInfoField 
                label="Teléfono" 
                value={contact.phone || ''} 
                onChange={(value) => handleChange('phone', value || null)} 
                icon={Phone} 
              />
              <ContactInfoField 
                label="Dirección" 
                value={contact.address || ''} 
                onChange={(value) => handleChange('address', value || null)} 
                icon={MapPin} 
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ContactInfoField 
                  label="Número de Apartamento" 
                  value={contact.apartment_number || ''} 
                  onChange={(value) => handleChange('apartment_number', value || null)} 
                  icon={Home} 
                />
                <ContactInfoField 
                  label="Barrio" 
                  value={contact.barrio || ''} 
                  onChange={(value) => handleChange('barrio', value || null)} 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField 
                  label="Célula" 
                  value={contact.cell_id} 
                  onChange={(value) => handleChange('cell_id', value)} 
                  options={cells} 
                  placeholder="Sin célula asignada" 
                />
                <SelectField 
                  label="Líder Asignado" 
                  value={contact.leader_assigned} 
                  onChange={(value) => handleChange('leader_assigned', value)} 
                  options={leaders.map(leader => ({ 
                    id: leader.id, 
                    name: `${leader.first_name} ${leader.last_name}` 
                  }))} 
                  placeholder="Sin líder asignado" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea 
                  id="notes" 
                  value={contact.notes || ''} 
                  onChange={(e) => handleChange('notes', e.target.value || null)} 
                  rows={4} 
                  placeholder="Agrega notas importantes sobre este contacto..." 
                />
              </div>
            </div>

            {/* Contact Log Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Historial de Contactos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add New Log */}
                <ContactLogForm 
                  newLog={newLog} 
                  setNewLog={setNewLog} 
                  onAddLog={handleAddLog} 
                />
                
                {/* Contact Logs Table */}
                {contactLogs.length > 0 ? (
                  <ContactLogsTable logs={contactLogs} />
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No hay registros de contacto aún.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactProfileDialog;