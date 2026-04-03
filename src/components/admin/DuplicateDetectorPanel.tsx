"use client";
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { findDuplicates, DuplicateGroup } from '@/lib/duplicate-detector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Search } from 'lucide-react';

interface Props {
  churchId: string;
}

const DuplicateDetectorPanel = ({ churchId }: Props) => {
  const [open, setOpen] = useState(false);

  const { data: duplicates, isLoading, refetch } = useQuery<DuplicateGroup[]>({
    queryKey: ['duplicates', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, address')
        .eq('church_id', churchId);
      if (!data) return [];
      return findDuplicates(data);
    },
    enabled: !!churchId && open,
  });

  const totalDupes = duplicates?.reduce((s, g) => s + g.contacts.length, 0) || 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); refetch(); }} className="gap-1.5">
        <Search className="h-4 w-4" /> Buscar duplicados
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detección de Duplicados</DialogTitle>
            <DialogDescription>
              {isLoading ? 'Analizando contactos...' : duplicates?.length
                ? `Se encontraron ${duplicates.length} grupo(s) con ${totalDupes} contactos posiblemente duplicados.`
                : 'No se encontraron duplicados.'}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Buscando duplicados...</div>
          ) : !duplicates?.length ? (
            <div className="py-8 text-center text-muted-foreground">✅ No se encontraron contactos duplicados.</div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((group, gi) => (
                <div key={gi} className={`border rounded-lg p-3 ${group.confidence === 'high' ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`h-4 w-4 ${group.confidence === 'high' ? 'text-red-400' : 'text-yellow-400'}`} />
                    <span className="text-sm font-medium">{group.reason}</span>
                    <Badge className={group.confidence === 'high' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}>
                      {group.confidence === 'high' ? 'Alta confianza' : 'Media confianza'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {group.contacts.map(c => (
                      <div key={c.id} className="flex justify-between items-center text-sm py-1 px-2 rounded hover:bg-muted/30">
                        <span className="font-medium">{c.first_name} {c.last_name || ''}</span>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {c.phone && <span>📞 {c.phone}</span>}
                          {c.address && <span className="truncate max-w-[200px]">📍 {c.address}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DuplicateDetectorPanel;
