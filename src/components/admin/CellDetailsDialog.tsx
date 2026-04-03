"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Users, UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ContactProfileDialog from './ContactProfileDialog';

interface CellDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  cellId: string | null;
}

interface CellItem {
  id: string;
  name: string;
  encargado_id: string | null;
  anfitrion_id: string | null;
  leader_name: string | null;
  anfitrion_name: string | null;
  address: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  address: string | null;
}

const CellDetailsDialog = ({ open, onOpenChange, churchId, cellId }: CellDetailsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [cell, setCell] = useState<CellItem | null>(null);
  const [leader, setLeader] = useState<Profile | null>(null);
  const [anfitrion, setAnfitrion] = useState<Profile | null>(null);
  const [attendees, setAttendees] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [profileContactId, setProfileContactId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cellId) return;

    const load = async () => {
      setLoading(true);
      // Load cell
      const { data: cellData } = await supabase
        .from('cells')
        .select('id, name, encargado_id, anfitrion_id, leader_name, anfitrion_name, address, meeting_day, meeting_time')
        .eq('id', cellId)
        .single();
      setCell(cellData as CellItem);

      // Load leader if any
      if (cellData?.encargado_id) {
        const { data: leaderData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('id', cellData.encargado_id)
          .single();
        setLeader(leaderData as Profile);
      } else {
        setLeader(null);
      }

      // Load anfitrion if any
      if (cellData?.anfitrion_id) {
        const { data: anfitrionData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('id', cellData.anfitrion_id)
          .single();
        setAnfitrion(anfitrionData as Profile);
      } else {
        setAnfitrion(null);
      }

      // Load attendees
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, address')
        .eq('church_id', churchId)
        .eq('cell_id', cellId)
        .order('first_name', { ascending: true });
      setAttendees((contactsData || []) as Contact[]);
      setLoading(false);
    };

    load();
  }, [open, cellId, churchId]);

  const filteredAttendees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendees;
    return attendees.filter(a => {
      const s = `${a.first_name} ${a.last_name || ''} ${a.phone || ''} ${a.address || ''}`.toLowerCase();
      return s.includes(q);
    });
  }, [attendees, search]);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => {
        if (!o) {
          setSearch('');
          setCell(null);
          setLeader(null);
          setAnfitrion(null);
          setAttendees([]);
        }
        onOpenChange(o);
      }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de la Célula</DialogTitle>
            <DialogDescription>Información de la célula y lista de asistentes.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="h-5 w-5" />
                    {cell?.name || '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <div className="text-muted-foreground">Líder de Célula</div>
                    <div>{leader ? `${leader.first_name || ''} ${leader.last_name || ''}`.trim() : cell?.leader_name || 'Sin asignar'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-muted-foreground">Anfitrión</div>
                    <div>{anfitrion ? `${anfitrion.first_name || ''} ${anfitrion.last_name || ''}`.trim() : cell?.anfitrion_name || 'Sin asignar'}</div>
                  </div>
                  <div className="text-sm flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-muted-foreground">Dirección</div>
                      <div>{cell?.address || '—'}</div>
                    </div>
                  </div>
                  <div className="text-sm flex items-start gap-2">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-muted-foreground">Día / Hora</div>
                      <div>{[cell?.meeting_day, cell?.meeting_time].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><Users className="h-5 w-5" /> Asistentes ({attendees.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Buscar por nombre, email o teléfono..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-[420px] overflow-auto divide-y rounded border">
                    {filteredAttendees.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">No hay asistentes.</div>
                    ) : (
                      filteredAttendees.map(a => {
                        const waNumber = (a.phone || '').replace(/[^\d]/g, '');
                        const mapQuery = encodeURIComponent(a.address || '');
                        return (
                          <div key={a.id} className="p-3 hover:bg-muted/50 transition-colors">
                            <button
                              className="font-medium hover:underline text-left"
                              onClick={() => setProfileContactId(a.id)}
                              title="Ver perfil del asistente"
                            >
                              {a.first_name} {a.last_name || ''}
                            </button>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {a.phone || 'Sin teléfono'}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <a
                                href={waNumber ? `https://wa.me/${waNumber}` : '#'}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-xs px-2 py-1 rounded border ${waNumber ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
                                onClick={(e) => { if (!waNumber) e.preventDefault(); }}
                              >
                                Enviar Whatsapp
                              </a>
                              <a
                                href={a.address ? `https://www.google.com/maps/search/?api=1&query=${mapQuery}` : '#'}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-xs px-2 py-1 rounded border ${a.address ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
                                onClick={(e) => { if (!a.address) e.preventDefault(); }}
                              >
                                Ver Dirección en Mapa
                              </a>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ContactProfileDialog
        open={!!profileContactId}
        onOpenChange={(o) => { if (!o) setProfileContactId(null); }}
        contactId={profileContactId}
        churchId={churchId}
      />
    </>
  );
};

export default CellDetailsDialog;