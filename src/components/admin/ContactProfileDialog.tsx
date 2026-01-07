"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { User, Mail, Phone, MapPin, Home, Users } from 'lucide-react';
import { logger } from '@/utils/logger';

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

interface ContactProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  churchId: string;
}

const ContactProfileDialog = ({ open, onOpenChange, contactId, churchId }: ContactProfileDialogProps) => {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Fetch contact details when dialog opens or contactId changes
  useEffect(() => {
    if (open && contactId) {
      fetchContactDetails();
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

  const handleChange = (field: keyof Contact, value: string | null) => {
    if (contact) {
      setContact({
        ...contact,
        [field]: value,
      });
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Perfil del Contacto</DialogTitle>
        </DialogHeader>
        
        {contact && (
          <div className="space-y-4">
            {/* Profile Picture Section */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="bg-gray-200 border-2 border-dashed rounded-xl w-24 h-24 flex items-center justify-center">
                  <User className="h-12 w-12 text-gray-400" />
                </div>
                <Button 
                  size="sm" 
                  className="absolute -bottom-2 left-1/2 transform -translate-x-1/2"
                  variant="outline"
                >
                  Cambiar Foto
                </Button>
              </div>
              <h2 className="text-xl font-bold">
                {contact.first_name} {contact.last_name || ''}
              </h2>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input
                    id="firstName"
                    value={contact.first_name}
                    onChange={(e) => handleChange('first_name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Apellido</Label>
                  <Input
                    id="lastName"
                    value={contact.last_name || ''}
                    onChange={(e) => handleChange('last_name', e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-10"
                    value={contact.email || ''}
                    onChange={(e) => handleChange('email', e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone"
                    className="pl-10"
                    value={contact.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="address"
                    className="pl-10"
                    value={contact.address || ''}
                    onChange={(e) => handleChange('address', e.target.value || null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apartment">Número de Apartamento</Label>
                  <div className="relative">
                    <Home className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="apartment"
                      className="pl-10"
                      value={contact.apartment_number || ''}
                      onChange={(e) => handleChange('apartment_number', e.target.value || null)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barrio">Barrio</Label>
                  <Input
                    id="barrio"
                    value={contact.barrio || ''}
                    onChange={(e) => handleChange('barrio', e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={contact.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value || null)}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
              >
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