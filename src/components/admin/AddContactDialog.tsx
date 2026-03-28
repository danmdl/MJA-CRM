"use client";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CountryPhoneInput from '@/components/CountryPhoneInput';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/hooks/use-session';
import { logEvent } from '@/utils/clientLogger';
import AddressAutocomplete from './AddressAutocomplete';

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

const SelectField = ({ label, value, onChange, options, loading, placeholder, disabled = false, container }: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  loading: boolean;
  placeholder: string;
  disabled?: boolean;
  container?: HTMLElement | null;
}) => (
  <div className="space-y-2">
    <label htmlFor={label.toLowerCase().replace(/\s/g, '-')} className="text-sm font-medium">
      {label}
    </label>
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled || loading} >
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Cargando..." : placeholder} />
      </SelectTrigger>
      <SelectContent container={container ?? undefined}>
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

const today = () => new Date().toISOString().split('T')[0];

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [fechaContacto, setFechaContacto] = useState<string>(today());
  const [sexo, setSexo] = useState<string | null>(null);
  const [estadoCivil, setEstadoCivil] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [pedidoDeOracion, setPedidoDeOracion] = useState('');
  const [conector, setConector] = useState('');
  const [leaderAssigned, setLeaderAssigned] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { session } = useSession();
  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const [dialogContainer, setDialogContainer] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (open) setTimeout(() => firstNameRef.current?.focus(), 50);
  }, [open]);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setPhone('');
    setAddress(''); setApartmentNumber('');
    setDateOfBirth(''); setFechaContacto(today());
    setSexo(null); setEstadoCivil('');
    setObservaciones(''); setPedidoDeOracion('');
    setConector('');
    setLeaderAssigned(null); setCellId(null);
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
          leader_assigned: leaderAssigned,
          conector: conector || null,
          cell_id: cellId,
          church_id: churchId,
          created_by: session?.user?.id || null,
          date_of_birth: dateOfBirth || null,
          fecha_contacto: fechaContacto || null,
          sexo: sexo || null,
          estado_civil: estadoCivil || null,
          observaciones: observaciones || null,
          pedido_de_oracion: pedidoDeOracion || null,
        });

      if (error) {
        showError(`Error: ${error.message}`);
        await logEvent({
          action: 'create_contact',
          error,
          payload: {
            first_name: firstName,
            last_name: lastName || null,
            phone: phone || null,
            address: address || null,
            apartment_number: apartmentNumber || null,
            leader_assigned: leaderAssigned,
            conector: conector || null,
            cell_id: cellId,
            church_id: churchId,
            date_of_birth: dateOfBirth || null,
            fecha_contacto: fechaContacto || null,
            sexo: sexo || null,
            estado_civil: estadoCivil || null,
          },
          context: { church_id: churchId },
        });
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
      <DialogContent ref={(el) => setDialogContainer(el)} className="w-full max-w-6xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Contacto</DialogTitle>

        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* 3-column grid for all fields */}
          <div className="overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 mb-2">

            {/* Nombre */}
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

            {/* Apellido */}
            <FormField
              label="Apellido"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
              placeholder="Ej: González"
            />

            {/* Teléfono */}
            <div className="space-y-2">
              <CountryPhoneInput label="Teléfono" value={phone} onChange={(v) => setPhone(v)} hideExample />
            </div>

            {/* Fecha de nacimiento */}
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

            {/* Fecha de Contacto */}
            <div className="space-y-2">
              <label htmlFor="fechaContacto" className="text-sm font-medium">Fecha de Contacto</label>
              <Input
                id="fechaContacto"
                type="date"
                value={fechaContacto}
                onChange={(e) => setFechaContacto(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Sexo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sexo</label>
              <Select value={sexo || undefined} onValueChange={(v) => setSexo(v === 'none' ? null : v)} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent container={dialogContainer ?? undefined}>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="femenino">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dirección - spans 2 cols */}
            <div className="col-span-3 space-y-2">
              <label className="text-sm font-medium">Dirección</label>
              <AddressAutocomplete
                value={address}
                onChange={(addr) => setAddress(addr || '')}
                placeholder="Ej: Av. Corrientes 1234"
                disabled={loading}
              />
            </div>

            {/* Número de Apartamento */}
            <FormField
              label="Número de Apartamento"
              id="apartmentNumber"
              value={apartmentNumber}
              onChange={(e) => setApartmentNumber(e.target.value)}
              disabled={loading}
              placeholder="Ej: 3B"
            />

{/* Estado Civil */}
            <FormField
              label="Estado Civil"
              id="estadoCivil"
              value={estadoCivil}
              onChange={(e) => setEstadoCivil(e.target.value)}
              disabled={loading}
              placeholder="Ej: Soltero/a, Casado/a..."
            />

            {/* Conector */}
            <FormField
              label="Conector"
              id="conector"
              value={conector}
              onChange={(e) => setConector(e.target.value)}
              disabled={loading}
              placeholder="Nombre de quien conectó"
            />

            {/* Célula */}
            <SelectField
              label="Célula"
              value={cellId}
              onChange={(value) => setCellId(value === "none" ? null : value)}
              options={cells || []}
              loading={isLoadingCells}
              placeholder="Selecciona una célula (opcional)"
              container={dialogContainer}
            />

            {/* Referente */}
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
              container={dialogContainer}
            />

            {/* Observaciones - spans full row */}
            <div className="col-span-4 space-y-2">
              <label htmlFor="observaciones" className="text-sm font-medium">Observaciones</label>
              <Textarea
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={loading}
                placeholder="Notas adicionales sobre el contacto..."
                rows={2}
              />
            </div>

            {/* Pedido de Oración - spans full row */}
            <div className="col-span-4 space-y-2">
              <label htmlFor="pedidoOracion" className="text-sm font-medium">Pedido de Oración</label>
              <Textarea
                id="pedidoOracion"
                value={pedidoDeOracion}
                onChange={(e) => setPedidoDeOracion(e.target.value)}
                disabled={loading}
                placeholder="¿Tiene algún pedido de oración?"
                rows={2}
              />
            </div>

          </div>
          </div>

          <DialogFooter className="gap-2 pt-4 border-t">
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
