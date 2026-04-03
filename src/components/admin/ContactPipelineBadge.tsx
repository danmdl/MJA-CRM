"use client";
import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const PIPELINE_STAGES = [
  { key: 'nuevo', label: 'Nuevo', color: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' },
  { key: 'contactado', label: 'Contactado', color: 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25' },
  { key: 'visito_celula', label: 'Visitó célula', color: 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25' },
  { key: 'activo', label: 'Activo', color: 'bg-green-500/15 text-green-400 hover:bg-green-500/25' },
  { key: 'inactivo', label: 'Inactivo', color: 'bg-red-500/15 text-red-400 hover:bg-red-500/25' },
] as const;

export const getStage = (key: string) => PIPELINE_STAGES.find(s => s.key === key) || PIPELINE_STAGES[0];

interface Props {
  status: string;
  onChange?: (newStatus: string) => void;
  editable?: boolean;
}

const ContactPipelineBadge = ({ status, onChange, editable = false }: Props) => {
  const stage = getStage(status);

  if (!editable || !onChange) {
    return <Badge className={`text-[11px] cursor-default ${stage.color}`}>{stage.label}</Badge>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge className={`text-[11px] cursor-pointer ${stage.color}`}>{stage.label}</Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PIPELINE_STAGES.map(s => (
          <DropdownMenuItem
            key={s.key}
            onClick={() => onChange(s.key)}
            className={s.key === status ? 'font-bold' : ''}
          >
            <span className={`w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0].replace('/15', '')}`} />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ContactPipelineBadge;
