"use client";

import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';

interface Church {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
  is_pinned: boolean;
  pin_order: number | null;
}

const fetchChurchDetails = async (churchId: string): Promise<Church> => {
  const { data, error } = await supabase
    .from('churches')
    .select('*')
    .eq('id', churchId)
    .single();

  if (error) {
    console.error('Error fetching church details:', error);
    throw new Error('No se pudieron cargar los detalles de la iglesia.');
  }
  return data;
};

const OverviewPage = () => {
  const { churchId } = useParams<{ churchId: string }>();

  const { data: church, isLoading, isError, error } = useQuery<Church>({
    queryKey: ['churchDetails', churchId],
    queryFn: () => fetchChurchDetails(churchId!),
    enabled: !!churchId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    showError(error?.message || 'Error al cargar los detalles de la iglesia.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los detalles de la iglesia.'}</div>;
  }

  if (!church) {
    return <div className="p-6 text-muted-foreground">No se encontraron detalles para esta iglesia.</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Resumen de {church.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{church.name}</CardTitle>
          <CardDescription>ID de la Iglesia: {church.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p><strong>Pastor ID:</strong> {church.pastor_id || 'No asignado'}</p>
          <p><strong>Fecha de Creación:</strong> {new Date(church.created_at).toLocaleDateString()}</p>
          <p><strong>Anclada:</strong> {church.is_pinned ? 'Sí' : 'No'}</p>
          {church.is_pinned && church.pin_order !== null && (
            <p><strong>Orden de Anclaje:</strong> {church.pin_order}</p>
          )}
          <p className="text-muted-foreground">
            Aquí puedes ver un resumen de la información clave de tu iglesia.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewPage;