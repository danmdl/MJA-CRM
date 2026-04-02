"use client";
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { MapPin, Users, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSession } from '@/hooks/use-session';

interface Zona { id: string; nombre: string; }
interface Contact {
  id: string; first_name: string; last_name: string | null;
  phone: string | null; address: string | null; barrio: string | null;
  zona_id: string | null; zona?: Zona | null;
  conector: string | null; fecha_contacto: string | null;
}

const CUERDA_ZONA: Record<string, string> = {
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

const PoolPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { session, profile } = useSession();
  const queryClient = useQueryClient();
  const [selectedZona, setSelectedZona] = useState<string>('unassigned');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [targetZona, setTargetZona] = useState<string>('');
  const [confirming, setConfirming] = useState(false);

  const isAdminOrPastor = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor';

  // Fetch zonas
  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!).order('nombre');
      return data || [];
    },
    enabled: !!churchId,
  });

  // Fetch contacts - unassigned or by zona
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-contacts', churchId, selectedZona],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, phone, address, barrio, zona_id, conector, fecha_contacto, zona:zonas(id, nombre)')
        .eq('church_id', churchId!);
      if (selectedZona === 'unassigned') {
        q = q.is('zona_id', null);
      } else {
        q = q.eq('zona_id', selectedZona);
      }
      // Connectors only see their own contacts
      if (profile?.role === 'user') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) q = q.eq('created_by', user.id);
      }
      const { data } = await q.order('fecha_contacto', { ascending: false }).limit(500);
      return (data || []) as Contact[];
    },
    enabled: !!churchId,
  });

  // Auto-assign: detect zona from barrio or address
  const detectZonaForContact = (contact: Contact, zonas: Zona[]): Zona | null => {
    if (!contact.barrio && !contact.address) return null;
    const text = ((contact.barrio || '') + ' ' + (contact.address || '')).toLowerCase();
    return zonas.find(z => text.includes(z.nombre.toLowerCase())) || null;
  };

  // Assign contacts mutation
  const assignMutation = useMutation({
    mutationFn: async ({ contactIds, zonaId }: { contactIds: string[]; zonaId: string }) => {
      const { error } = await supabase.from('contacts')
        .update({ 
          zona_id: zonaId, 
          pool_assigned_at: new Date().toISOString(),
          pool_assigned_by: session?.user?.id 
        })
        .in('id', contactIds);
      if (error) throw error;
    },
    onSuccess: (_, { contactIds, zonaId }) => {
      const zona = zonas?.find(z => z.id === zonaId);
      showSuccess(`${contactIds.length} contacto(s) asignados a ${zona?.nombre}.`);
      setSelectedContacts([]);
      setTargetZona('');
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['pool-contacts', churchId] });
    },
    onError: (err: any) => showError(err.message),
  });

  // Auto-assign all unassigned
  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!contacts || !zonas) return;
      const assignments: { id: string; zona_id: string }[] = [];
      for (const contact of contacts) {
        const zona = detectZonaForContact(contact, zonas);
        if (zona) assignments.push({ id: contact.id, zona_id: zona.id });
      }
      if (assignments.length === 0) throw new Error('No se pudo detectar la zona de ningún contacto.');
      
      for (const a of assignments) {
        await supabase.from('contacts').update({ 
          zona_id: a.zona_id,
          pool_assigned_at: new Date().toISOString(),
          pool_assigned_by: session?.user?.id
        }).eq('id', a.id);
      }
      return assignments.length;
    },
    onSuccess: (count) => {
      showSuccess(`${count} contacto(s) asignados automáticamente.`);
      queryClient.invalidateQueries({ queryKey: ['pool-contacts', churchId] });
    },
    onError: (err: any) => showError(err.message || 'No se pudo auto-asignar.'),
  });

  const unassignedCount = selectedZona === 'unassigned' ? contacts?.length || 0 : 0;
  const allSelected = contacts?.length > 0 && selectedContacts.length === contacts?.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Pool de Contactos por Zona
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Asignación de contactos a zonas después de la jornada de conexión
          </p>
        </div>
      </div>

      {/* Zone stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={`cursor-pointer transition-all ${selectedZona === 'unassigned' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => { setSelectedZona('unassigned'); setSelectedContacts([]); }}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Sin asignar</p>
                <p className="text-2xl font-bold">{unassignedCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        {zonas?.map(zona => (
          <Card
            key={zona.id}
            className={`cursor-pointer transition-all ${selectedZona === zona.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => { setSelectedZona(zona.id); setSelectedContacts([]); }}
          >
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground truncate">{zona.nombre}</p>
              <p className="text-xl font-bold">Pool</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action bar */}
      {selectedZona === 'unassigned' && isAdminOrPastor && contacts && contacts.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg flex-wrap">
          <span className="text-sm font-medium">{selectedContacts.length} seleccionado(s)</span>
          
          {/* Auto-assign button */}
          <Button
            variant="outline" size="sm"
            onClick={() => autoAssignMutation.mutate()}
            disabled={autoAssignMutation.isPending}
          >
            <MapPin className="mr-1.5 h-4 w-4" />
            {autoAssignMutation.isPending ? 'Asignando...' : 'Auto-asignar por barrio/dirección'}
          </Button>

          {/* Manual assign selected */}
          {selectedContacts.length > 0 && (
            <>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={targetZona}
                onChange={e => setTargetZona(e.target.value)}
              >
                <option value="">Asignar a zona...</option>
                {zonas?.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
              {targetZona && !confirming && (
                <Button size="sm" onClick={() => setConfirming(true)}>
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                  Asignar {selectedContacts.length} a {zonas?.find(z => z.id === targetZona)?.nombre}
                </Button>
              )}
              {confirming && (
                <>
                  <span className="text-sm text-yellow-600">¿Confirmar asignación?</span>
                  <Button size="sm" onClick={() => assignMutation.mutate({ contactIds: selectedContacts, zonaId: targetZona })}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Contacts table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {selectedZona === 'unassigned' ? (
              <><AlertCircle className="h-5 w-5 text-yellow-500" /> Sin asignar ({contacts?.length || 0})</>
            ) : (
              <><CheckCircle2 className="h-5 w-5 text-green-500" /> {zonas?.find(z => z.id === selectedZona)?.nombre} ({contacts?.length || 0})</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : !contacts?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {selectedZona === 'unassigned' ? 'Todos los contactos están asignados a una zona ✅' : 'No hay contactos en esta zona todavía.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectedZona === 'unassigned' && isAdminOrPastor && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => setSelectedContacts(allSelected ? [] : (contacts?.map(c => c.id) || []))}
                        />
                      </TableHead>
                    )}
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Barrio</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Conector</TableHead>
                    <TableHead>Fecha contacto</TableHead>
                    {selectedZona === 'unassigned' && <TableHead>Zona sugerida</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map(c => {
                    const suggested = selectedZona === 'unassigned' && zonas ? detectZonaForContact(c, zonas) : null;
                    return (
                      <TableRow key={c.id} className={selectedContacts.includes(c.id) ? 'bg-muted' : ''}>
                        {selectedZona === 'unassigned' && isAdminOrPastor && (
                          <TableCell>
                            <Checkbox
                              checked={selectedContacts.includes(c.id)}
                              onCheckedChange={() => setSelectedContacts(prev =>
                                prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                              )}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{c.first_name} {c.last_name || ''}</TableCell>
                        <TableCell>{c.phone || '-'}</TableCell>
                        <TableCell>{c.barrio || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{c.address || '-'}</TableCell>
                        <TableCell>{c.conector || '-'}</TableCell>
                        <TableCell>{c.fecha_contacto || '-'}</TableCell>
                        {selectedZona === 'unassigned' && (
                          <TableCell>
                            {suggested ? (
                              <Badge className="bg-green-500/20 text-green-700 hover:bg-green-500/20">{suggested.nombre}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin datos</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PoolPage;
