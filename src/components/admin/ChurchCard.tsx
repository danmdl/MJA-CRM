"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Church, Users, Database, ArrowRight, MoreHorizontal, Pencil, Trash2, Pin, PinOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'piloto' | 'encargado_de_celula' | 'user';

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
  const pastorName = church.pastor_id ? `Pastor ID: ${church.pastor_id.substring(0, 8)}...` : 'No asignado';

  const isAdminOrGeneral = currentUserRole === 'admin' || currentUserRole === 'general';
  const isAssignedToChurch = currentUserChurchId === church.id;
  const canManageChurch = isAdminOrGeneral || isAssignedToChurch;

  return (
    <Card className="flex flex-col justify-between h-full">
      <CardHeader className="relative">
        <div className="flex items-center space-x-3 mb-2">
          <Church className="h-6 w-6 text-primary" />
          <CardTitle className="text-xl">{church.name}</CardTitle>
          {church.is_pinned && (
            <Pin className="h-4 w-4 text-muted-foreground rotate-45" aria-label="Anclado" />
          )}
        </div>
        <CardDescription>
          {pastorName}
        </CardDescription>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 absolute top-4 right-4" disabled={!canManageChurch && !isAdminOrGeneral}>
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(church)} disabled={!isAdminOrGeneral}>
              <Pencil className="mr-2 h-4 w-4" /> Editar Nombre
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPinToggle({ churchId: church.id, isPinned: !church.is_pinned })} disabled={!isAdminOrGeneral}>
              {church.is_pinned ? (
                <>
                  <PinOff className="mr-2 h-4 w-4" /> Desanclar
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-4 w-4" /> Anclar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(church.id, church.name)} className="text-red-600" disabled={!isAdminOrGeneral}>
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar Iglesia
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-col space-y-2">
        <Button variant="outline" asChild disabled={!canManageChurch}>
          <Link to={`/admin/churches/${church.id}/database`} className="flex items-center justify-start">
            <Database className="mr-2 h-4 w-4" /> Gestionar Base de Datos
          </Link>
        </Button>
        <Button variant="outline" asChild disabled={!canManageChurch}>
          <Link to={`/admin/churches/${church.id}/team`} className="flex items-center justify-start">
            <Users className="mr-2 h-4 w-4" /> Gestionar Equipo
          </Link>
        </Button>
        <Button asChild disabled={!canManageChurch}>
          <Link to={`/admin/churches/${church.id}/overview`} className="flex items-center justify-center">
            Ver Detalles <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default ChurchCard;