"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';

interface Cell {
  id: string;
  name: string;
}

interface Leader {
  id: string;
  first_name: string;
  last_name: string;
}

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
}

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [barrio, setBarrio] = useState('');
  const [leaderAssigned, setLeaderAssigned] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  logger.log('AddContactDialog rendered', { open, churchId });

  // Fetch cells for the current church
  const { data: cells, isLoading: isLoadingCells } = useQuery<Cell[]>({
    queryKey: ['cells', churchId],
    queryFn: async () => {
      logger.log('Fetching cells for church', { churchId });
      const { data, error } = await supabase
        .from('cells')
        .select('id, name')
        .eq('church_id', churchId)
        .order('name', { ascending: true });
      
      if (error) {
        logger.error('Error fetching cells', error);
        throw new Error('No se pudieron cargar las células.');
      }
      
      logger.log('Cells fetched successfully', data);
      return data || [];
    },
    enabled: !!churchId,
  });

  // Fetch leaders for the current church (pastor, piloto, encargado_de_celula)
  const { data: leaders, isLoading: isLoadingLeaders } = useQuery<Leader[]>({
    queryKey: ['leaders', churchId],
    queryFn: async () => {
      logger.log('Fetching leaders for church', { churchId });
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('church_id', churchId)
        .in('role', ['pastor', 'piloto', 'encargado_de_celula'])
        .order('first_name', { ascending: true });
      
      if (error) {
        logger.error('Error fetching leaders', error);
        throw new Error('No se pudieron cargar los líderes.');
      }
      
      logger.log('Leaders fetched successfully', data);
      return data || [];
    },
    enabled: !!churchId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    logger.log('Form submitted', { 
      firstName, lastName, email, phone, address, apartmentNumber, barrio, leaderAssigned, cellId, churchId 
    });
    
    setLoading(true);
    try {
      logger.log('Attempting to insert contact...');
      const { data, error } = await supabase
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
        })
        .select();
      
      if (error) {
        logger.error('Supabase error:', error);
        showError(`Error: ${error.message}`);
      } else {
        logger.log('Contact inserted successfully:', data);
        showSuccess(`¡Contacto "${firstName}" añadido con éxito!`);
        
        // Reset form
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setApartmentNumber('');
        setBarrio('');
        setLeaderAssigned(null);
        setCellId(null);
        
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        onOpenChange(false);
      }
    } catch (error: any) {
      logger.error('Unexpected error:', error);
      showError(`Error inesperado: ${error.message}`);
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
          <div className="space-y-2">
            <label htmlFor="firstName" className="text-sm font-medium">
              Nombre *
            </label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="lastName" className="text-sm font-medium">
              Apellido
            </label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Correo Electrónico
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">
              Teléfono
            </label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              Dirección
            </label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="apartmentNumber" className="text-sm font-medium">
              Número de Apartamento
            </label>
            <Input
              id="apartmentNumber"
              value={apartmentNumber}
              onChange={(e) => setApartmentNumber(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="barrio" className="text-sm font-medium">
              Barrio
            </label>
            <Input
              id="barrio"
              value={barrio}
              onChange={(e) => setBarrio(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {/* Cell selector */}
          <div className="space-y-2">
            <label htmlFor="cellId" className="text-sm font-medium">
              Célula
            </label>
            <Select
              value={cellId || undefined}
              onValueChange={(value) => setCellId(value === "none" ? null : value)}
              disabled={loading || isLoadingCells}
            >
              <SelectTrigger>
                <SelectValue 
                  placeholder={isLoadingCells ? "Cargando células..." : "Selecciona una célula (opcional)"} 
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin célula asignada</SelectItem>
                {cells?.map((cell) => (
                  <SelectItem key={cell.id} value={cell.id}>
                    {cell.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Leader selector */}
          <div className="space-y-2">
            <label htmlFor="leaderAssigned" className="text-sm font-medium">
              Líder Asignado
            </label>
            <Select
              value={leaderAssigned || undefined}
              onValueChange={(value) => setLeaderAssigned(value === "none" ? null : value)}
              disabled={loading || isLoadingLeaders}
            >
              <SelectTrigger>
                <SelectValue 
                  placeholder={isLoadingLeaders ? "Cargando líderes..." : "Selecciona un líder (opcional)"} 
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin líder asignado</SelectItem>
                {leaders?.map((leader) => (
                  <SelectItem key={leader.id} value={leader.id}>
                    {leader.first_name} {leader.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)} 
              disabled={loading}
            >
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