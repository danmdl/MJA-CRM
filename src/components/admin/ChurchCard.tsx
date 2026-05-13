"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'gestor_de_cuerda' | 'encargado_de_celula' | 'conector' | 'consolidador' | 'supervisor' | 'anfitrion';

interface ChurchProps {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
  is_pinned: boolean;
  pin_order: number | null;
}

interface ChurchCardProps {
  church: ChurchProps;
  onEdit: (church: ChurchProps) => void;
  onDelete: (churchId: string, churchName: string) => void;
  onPinToggle: ({ churchId, isPinned }: { churchId: string; isPinned: boolean }) => void;
  currentUserChurchId: string | null | undefined; // Current user's assigned church ID
  currentUserRole: UserRole | null | undefined; // Current user's role
}

const ChurchCard = ({ church, onEdit, onDelete, currentUserRole }: ChurchCardProps) => {
  // Cells: filter out soft-deleted ones. The previous version counted every
  // cell including ones in the trash, which inflated the number on the card.
  const { data: cellsCount } = useQuery({
    queryKey: ['card-cells-count', church.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('cells')
        .select('id', { count: 'planned', head: true })
        .eq('church_id', church.id)
        .is('deleted_at', null);
      return count || 0;
    }
  });

  // Contacts: alive only. This is the metric that matters for measuring
  // the church's reach — the Semillero plus everyone already assigned.
  const { data: contactsCount } = useQuery({
    queryKey: ['card-contacts-count', church.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('contacts')
        .select('id', { count: 'planned', head: true })
        .eq('church_id', church.id)
        .is('deleted_at', null);
      return count || 0;
    }
  });

  // Team members: profiles assigned to this church. The previous card
  // showed "miembros" but was actually counting contacts with a cell_id,
  // which is a different concept entirely (and was 4 for MJA Central
  // when the team is 18 — confusing). Now it counts profiles, which is
  // what the label implies.
  const { data: teamCount } = useQuery({
    queryKey: ['card-team-count', church.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'planned', head: true })
        .eq('church_id', church.id);
      return count || 0;
    }
  });


  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{church.name}</CardTitle>
        <CardDescription>{cellsCount ?? 0} células · {contactsCount ?? 0} contactos · {teamCount ?? 0} en equipo</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Button asChild>
          <a href={`/admin/churches/${church.id}/overview`}>Ver Detalles</a>
        </Button>
        {currentUserRole === 'admin' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(church)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar nombre
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => onDelete(church.id, church.name)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar iglesia
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
};

export default ChurchCard;