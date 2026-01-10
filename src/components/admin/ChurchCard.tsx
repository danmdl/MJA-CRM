"use client";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Church, Users, Database, ArrowRight, MoreHorizontal, Pencil, Trash2, Pin, PinOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

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

const ChurchCard = ({ church, onEdit, onDelete, onPinToggle, currentUserChurchId, currentUserRole }: ChurchCardProps) => {
  const { data: cellsCount } = useQuery({
    queryKey: ['card-cells-count', church.id],
    queryFn: async () => {
      const { count } = await supabase.from('cells').select('id', { count: 'exact', head: true }).eq('church_id', church.id);
      return count || 0;
    }
  });

  const { data: membersInCells } = useQuery({
    queryKey: ['card-members-count', church.id],
    queryFn: async () => {
      const { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('church_id', church.id).not('cell_id', 'is', null);
      return count || 0;
    }
  });

  const pastorName = church.pastor_id ? `Pastor ID: ${church.pastor_id.substring(0, 8)}...` : 'No asignado';
  const isAdminOrGeneral = currentUserRole === 'admin' || currentUserRole === 'general';
  const isAssignedToChurch = currentUserChurchId === church.id;
  const canManageChurch = isAdminOrGeneral || isAssignedToChurch;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{church.name}</CardTitle>
        <CardDescription>{cellsCount ?? 0} células · {membersInCells ?? 0} miembros</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Button asChild>
          <a href={`/admin/churches/${church.id}/overview`}>Ver Detalles</a>
        </Button>
      </CardContent>
    </Card>
  );
};

export default ChurchCard;