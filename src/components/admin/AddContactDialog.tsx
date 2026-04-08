"use client";
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CountryPhoneInput from '@/components/CountryPhoneInput';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import { useSession } from '@/hooks/use-session';
import { logEvent } from '@/utils/clientLogger';
import AddressAutocomplete from './AddressAutocomplete';
import { isWithinGBA as isWithinGBACheck } from '@/lib/geo-validation';

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

const nativeSelectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
    <label className="text-sm font-medium">{label}</label>
    <select
      className={nativeSelectClass}
      value={value || 'none'}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
    >
      <option value="none">{loading ? 'Cargando...' : 'Sin asignación'}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  </div>
);

const today = () => new Date().toISOString().split('T')[0];

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [contactLat, setContactLat] = useState<number | null>(null);
  const [contactLng, setContactLng] = useState<number | null>(null);
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [edad, setEdad] = useState<string>('');
  const [rangoEtario, setRangoEtario] = useState<string>('');
  const [fechaContacto, setFechaContacto] = useState<string>(today());
  const [sexo, setSexo] = useState<string | null>(null);
  const [estadoCivil, setEstadoCivil] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [pedidoDeOracion, setPedidoDeOracion] = useState('');
  const [conector, setConector] = useState(() => ''); // will be set in useEffect
  const [leaderAssigned, setLeaderAssigned] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { session, profile } = useSession();
  const firstNameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => firstNameRef.current?.focus(), 50);
      // Auto-fill Conector with the logged-in user's full name
      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
      if (name) setConector(name);
    } else {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setPhone('');
    setAddress(''); setApartmentNumber('');
    setDateOfBirth(''); setFechaContacto(today());
    setSexo(null); setEstadoCivil('');
    setObservaciones(''); setPedidoDeOracion('');
    setConector('');
    setLeaderAssigned(null); setCellId(null);
    setContactLat(null); setContactLng(null);
  };


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
      const { data: createdContact, error } = await supabase
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
          edad: edad ? parseInt(edad) : null,
          fecha_contacto: fechaContacto || null,
          sexo: sexo || null,
          estado_civil: estadoCivil || null,
          observaciones: observaciones || null,
          pedido_de_oracion: pedidoDeOracion || null,
          numero_cuerda: profile?.numero_cuerda || null,
          lat: contactLat,
          lng: contactLng,
          estado_seguimiento: 'nuevo',
        })
        .select()
        .single();

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
        // Log contact creation to activity_logs
        if (createdContact) {
          await supabase.from('activity_logs').insert({
            user_id: session?.user?.id,
            church_id: churchId,
            action: 'create',
            entity_type: 'contact',
            entity_id: createdContact.id,
            before_data: null,
            after_data: createdContact,
          });
        }
        showSuccess(`¡Contacto "${firstName}" añadido con éxito!`);
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        queryClient.invalidateQueries({ queryKey: ['historial'] });
        if (keepOpen) {
          resetForm();
          setTimeout(() => firstNameRef.current?.focus(), 50);
        } else {
          onOpenChange(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const formStyles = `
    .contact-form-grid { grid-template-columns: 1fr; }
    .contact-form-col-wide { grid-column: span 1; }
    .contact-form-col-full { grid-column: span 1; }
    @media (min-width: 640px) {
      .contact-form-grid { grid-template-columns: repeat(2, 1fr); }
      .contact-form-col-wide { grid-column: span 2; }
      .contact-form-col-full { grid-column: span 2; }
    }
    @media (min-width: 1024px) {
      .contact-form-grid { grid-template-columns: repeat(4, 1fr); }
      .contact-form-col-wide { grid-column: span 3; }
      .contact-form-col-full { grid-column: span 4; }
    }
  `;

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onOpenChange]);

  return (
    <>
    <style>{formStyles}</style>
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: open ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) { onOpenChange(false); } }}
    >
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: -1 }} />
      {/* Modal */}
      <div className="w-full lg:max-w-3xl lg:rounded-xl lg:border lg:border-[hsl(240,3.7%,15.9%)] lg:shadow-2xl" style={{ backgroundColor: 'hsl(240,10%,3.9%)', display: 'flex', flexDirection: 'column', maxHeight: '90dvh' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid hsl(240,3.7%,15.9%)', flexShrink: 0 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'hsl(0,0%,98%)' }}>Crear Nuevo Contacto</h2>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
          <div className="contact-form-grid" style={{ display: "grid", gap: "12px 12px", marginBottom: "8px" }}>

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
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => {
                  setDateOfBirth(e.target.value);
                  if (e.target.value) {
                    const dob = new Date(e.target.value);
                    const now = new Date();
                    let age = now.getFullYear() - dob.getFullYear();
                    const m = now.getMonth() - dob.getMonth();
                    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
                    if (age >= 0) {
                      setEdad(String(age));
                      if (age <= 12) setRangoEtario('Niño (0-12)');
                      else if (age <= 17) setRangoEtario('Adolescente (13-17)');
                      else if (age <= 25) setRangoEtario('Joven (18-25)');
                      else if (age <= 35) setRangoEtario('Adulto joven (26-35)');
                      else if (age <= 59) setRangoEtario('Adulto (36-59)');
                      else setRangoEtario('Crecer (60+)');
                    }
                  }
                }}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Edad + Rango Etario */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Edad</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="120"
                value={edad}
                onChange={(e) => {
                  if (dateOfBirth) return;
                  const v = e.target.value;
                  setEdad(v);
                  const n = parseInt(v);
                  if (!isNaN(n)) {
                    if (n <= 12) setRangoEtario('Niño (0-12)');
                    else if (n <= 17) setRangoEtario('Adolescente (13-17)');
                    else if (n <= 25) setRangoEtario('Joven (18-25)');
                    else if (n <= 35) setRangoEtario('Adulto joven (26-35)');
                    else if (n <= 59) setRangoEtario('Adulto (36-59)');
                    else setRangoEtario('Crecer (60+)');
                  } else {
                    setRangoEtario('');
                  }
                }}
                readOnly={!!dateOfBirth}
                disabled={loading}
                placeholder="Ej: 32"
                className={`flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ${dateOfBirth ? 'bg-muted text-muted-foreground cursor-default' : 'bg-background'}`}
              />
            </div>

            {/* Rango Etario */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Rango Etario</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={rangoEtario}
                onChange={(e) => setRangoEtario(e.target.value)}
                disabled={loading}
              >
                <option value="">Sin especificar</option>
                <option value="Niño (0-12)">Niño (0-12)</option>
                <option value="Adolescente (13-17)">Adolescente (13-17)</option>
                <option value="Joven (18-25)">Joven (18-25)</option>
                <option value="Adulto joven (26-35)">Adulto joven (26-35)</option>
                <option value="Adulto (36-59)">Adulto (36-59)</option>
                <option value="Crecer (60+)">Crecer (60+)</option>
              </select>
            </div>

            {/* Fecha de Contacto - auto today, readonly */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha de Contacto</label>
              <input
                type="date"
                value={fechaContacto}
                readOnly
                className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-default"
              />
            </div>

            {/* Sexo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sexo</label>
              <select
                className={nativeSelectClass}
                value={sexo || 'none'}
                onChange={(e) => setSexo(e.target.value === 'none' ? null : e.target.value)}
                disabled={loading}
              >
                <option value="none">Sin especificar</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>

            {/* Dirección - spans 2 cols */}
            <div className="contact-form-col-wide space-y-2">
              <label className="text-sm font-medium">Dirección</label>
              <AddressAutocomplete
                value={address}
                onChange={(addr, lat, lng) => { setAddress(addr || ''); if (lat != null && lng != null && isWithinGBACheck(lat, lng)) { setContactLat(lat); setContactLng(lng); } else if (lat != null) { setContactLat(null); setContactLng(null); } }}
                placeholder="Ej: Av Corrientes 4000, CABA"
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado Civil</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={estadoCivil}
                onChange={(e) => setEstadoCivil(e.target.value)}
                disabled={loading}
              >
                <option value="">Sin especificar</option>
                <option value="Soltero/a">Soltero/a</option>
                <option value="Casado/a">Casado/a</option>
                <option value="En pareja">En pareja</option>
                <option value="Viudo/a">Viudo/a</option>
                <option value="Separado/a">Separado/a</option>
                <option value="N/A">N/A</option>
              </select>
            </div>

{/* Conector - read-only for Conector role */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Conector</label>
              <Input
                id="conector"
                value={conector}
                disabled={loading}
                readOnly
                className="bg-muted text-muted-foreground cursor-default"
              />
            </div>



            {/* Observaciones - spans full row */}
            <div className="contact-form-col-full space-y-2">
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
            <div className="contact-form-col-full space-y-2">
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid hsl(240,3.7%,15.9%)', flexShrink: 0 }}>
            <Button type="button" variant="ghost" onClick={() => { onOpenChange(false); }} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" disabled={loading || !firstName.trim()} onClick={(e) => handleSubmit(e as any, true)}>
              {loading ? 'Guardando...' : 'Guardar y agregar otro'}
            </Button>
            <Button type="submit" disabled={loading || !firstName.trim()}>
              {loading ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default AddContactDialog;
