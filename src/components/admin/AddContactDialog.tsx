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

const FormField = ({ label, id, value, onChange, type = "text", required = false, disabled = false, placeholder = "" }: {
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

const SelectField = ({ label, value, onChange, options, loading, placeholder, disabled = false }: {
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
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled || loading} >
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
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [barrio, setBarrio] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [leaderAssigned, setLeaderAssigned] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { session } = useSession();
  const firstNameRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus first name when dialog opens
  React.useEffect(() => {
    if (open) setTimeout(() => firstNameRef.current?.focus(), 50);
  }, [open]);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setPhone('');
    setAddress(''); setApartmentNumber(''); setBarrio('');
    setDateOfBirth(''); setLeaderAssigned(null); setCellId(null);
  };

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
          const leaderRoles = ['pastor', 'referente', 'encargado_de_celula', 'general'];
          return (data || [])
            .filter((u: any) => leaderRoles.includes(u.role))
            .map((u: any) => ({
              id: u.id,
              first_name: u.first_name,
              last_name: u.last_name
            })) as Leader[];
        }
        return [];
      }
      return [];
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const handleSubmit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('contacts')
        .insert({
          first_name: firstName,
          last_name: lastName || null,
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
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        if (keepOpen) {
          resetForm();
          setTimeout(() => firstNameRef.current?.focus(), 50);
        } else {
          resetForm();
          onOpenChange(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Contacto</DialogTitle>
          <DialogDescription>
            Completa los datos del contacto. Presiona <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Enter</kbd> para guardar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {/* Row 1: Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium">
                Nombre <span className="text-red-500">*</span>
              </label>
              <Input
                id="firstName"
                ref={firstNameRef}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
                required
                placeholder="Ej: María"
              />
            </div>
            <FormField
              label="Apellido"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
              placeholder="Ej: González"
            />
          </div>

          {/* Row 2: Teléfono + Fecha de nacimiento */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <CountryPhoneInput label="Teléfono" value={phone} onChange={(v) => setPhone(v)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="dob" className="text-sm font-medium">Fecha de nacimiento</label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Row 3: Dirección + Número de Apartamento */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField
              label="Dirección"
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
              placeholder="Ej: Av. Corrientes 1234"
            />
            <FormField
              label="Número de Apartamento"
              id="apartmentNumber"
              value={apartmentNumber}
              onChange={(e) => setApartmentNumber(e.target.value)}
              disabled={loading}
              placeholder="Ej: 3B"
            />
          </div>

          {/* Row 4: Barrio + Célula */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField
              label="Barrio"
              id="barrio"
              value={barrio}
              onChange={(e) => setBarrio(e.target.value)}
              disabled={loading}
              placeholder="Ej: Palermo"
            />
            <SelectField
              label="Célula"
              value={cellId}
              onChange={(value) => setCellId(value === "none" ? null : value)}
              options={cells || []}
              loading={isLoadingCells}
              placeholder="Selecciona una célula (opcional)"
            />
          </div>

          {/* Row 5: Referente (full width) */}
          <div className="mb-6">
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
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => { resetForm(); onOpenChange(false); }} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" disabled={loading || !firstName.trim()} onClick={(e) => handleSubmit(e as any, true)}>
              {loading ? 'Guardando...' : 'Guardar y agregar otro'}
            </Button>
            <Button type="submit" disabled={loading || !firstName.trim()}>
              {loading ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddContactDialog;