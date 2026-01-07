"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import CountryPhoneInput from '@/components/CountryPhoneInput';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/hooks/use-session';

interface Cell {
  id: string;
  name: string;
}

interface Leader {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
}

const FormField = ({
  label,
  id,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  placeholder = ""
}: {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) => (
  <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <Input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
    />
  </div>
);

const SelectField = ({
  label,
  value,
  onChange,
  options,
  loading,
  placeholder,
  disabled = false
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  loading: boolean;
  placeholder: string;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <label htmlFor={label.toLowerCase().replace(/\s/g, '-')} className="text-sm font-medium">
      {label}
    </label>
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled || loading}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Cargando..." : placeholder} />
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

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [barrio, setBarrio] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [leaderAssigned, setLeaderAssigned] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { session } = useSession();

  logger.log('AddContactDialog rendered', { open, churchId });

  const { data: cells, isLoading: isLoadingCells } = useQuery<Cell[]>({
    queryKey: ['cells', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name')
        .eq('church_id', churchId)
        .order('name', { ascending: true });
      if (error) throw new Error('No se pudieron cargar las células.');
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 60_000,
  });

  const { data: leaders, isLoading: isLoadingLeaders } = useQuery<Leader[]>({
    queryKey: ['leaders', churchId, !!session?.access_token],
    queryFn: async () => {
      if (session?.access_token) {
        const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
        const resp = await fetch(edgeFunctionUrl, {
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
          return (data || [])
            .filter((u: any) => leaderRoles.includes(u.role))
            .map((u: any) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name })) as Leader[];
        }
        return [];
      }
      return [];
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .insert({
          first_name: firstName,
          last_name: lastName || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          apartment_number: apartmentNumber || null,
          barrio: barrio || null,
          leader_assigned: leaderAssigned,
          cell_id: cellId,
          church_id: churchId,
          date_of_birth: dateOfBirth || null,
        });
      if (error) {
        showError(`Error: ${error.message}`);
      } else {
        showSuccess(`¡Contacto "${firstName}" añadido con éxito!`);
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setApartmentNumber('');
        setBarrio('');
        setDateOfBirth('');
        setLeaderAssigned(null);
        setCellId(null);
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Contacto</DialogTitle>
          <DialogDescription>
            Introduce los detalles del nuevo contacto para esta iglesia.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Nombre" id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={loading} />
          <FormField label="Apellido" id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
          <FormField label="Correo Electrónico" id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={loading} />
          <CountryPhoneInput label="Teléfono" value={phone} onChange={(v) => setPhone(v)} />
          <FormField label="Dirección" id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={loading} />
          <FormField label="Número de Apartamento" id="apartmentNumber" value={apartmentNumber} onChange={(e) => setApartmentNumber(e.target.value)} disabled={loading} />
          <FormField label="Barrio" id="barrio" value={barrio} onChange={(e) => setBarrio(e.target.value)} disabled={loading} />
          <div className="space-y-2">
            <label htmlFor="dob" className="text-sm font-medium">Fecha de nacimiento</label>
            <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} disabled={loading} />
          </div>
          <SelectField
            label="Célula"
            value={cellId}
            onChange={(value) => setCellId(value === "none" ? null : value)}
            options={cells || []}
            loading={isLoadingCells}
            placeholder="Selecciona una célula (opcional)"
          />
          <SelectField
            label="Referente asignado"
            value={leaderAssigned}
            onChange={(value) => setLeaderAssigned(value === "none" ? null : value)}
            options={(leaders || []).map(leader => ({
              id: leader.id,
              name: `${leader.first_name || ''} ${leader.last_name || ''}`.trim() || 'Sin nombre'
            }))}
            loading={isLoadingLeaders}
            placeholder="Selecciona un referente (opcional)"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddContactDialog;