"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AddChurchDialog from '@/components/admin/AddChurchDialog';
import ChurchCard from '@/components/admin/ChurchCard';
import EditChurchNameDialog from '@/components/admin/EditChurchNameDialog';
import DeleteChurchConfirmationDialog from '@/components/admin/DeleteChurchConfirmationDialog';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session'; // Import useSession

interface Church {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
  is_pinned: boolean;
  pin_order: number | null;
}

const fetchChurches = async (): Promise<Church[]> => {
  const { data, error } = await supabase
    .from('churches')
    .select('*')
    .order('is_pinned', { ascending: false }) // Pinned items first
    .order('pin_order', { ascending: true, nullsFirst: false }) // Then by pin_order
    .order('name', { ascending: true }); // Then by name

  if (error) {
    console.error('Error fetching churches:', error);
    throw new Error('No se pudieron cargar las iglesias.');
  }
  return data || [];
};

const ChurchesPage = () => {
  const { profile } = useSession(); // Get user profile
  const [isAddChurchDialogOpen, setIsAddChurchDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const [churchToDelete, setChurchToDelete] = useState<{ id: string; name: string } | null>(null);

  const queryClient = useQueryClient();
  const { data: churches, isLoading, isError, error } = useQuery<Church[]>({
    queryKey: ['churches'],
    queryFn: fetchChurches,
  });

  const handleEditChurch = (church: Church) => {
    setSelectedChurch(church);
    setIsEditDialogOpen(true);
  };

  const handleDeleteChurch = (churchId: string, churchName: string) => {
    setChurchToDelete({ id: churchId, name: churchName });
    setIsDeleteDialogOpen(true);
  };

  const pinChurchMutation = useMutation({
    mutationFn: async ({ churchId, isPinned }: { churchId: string; isPinned: boolean }) => {
      let newPinOrder: number | null = null;
      if (isPinned) {
        // Find the maximum existing pin_order and add 1, or start at 1
        const maxPinOrder = churches?.reduce((max, c) => (c.is_pinned && c.pin_order !== null ? Math.max(max, c.pin_order) : max), 0) || 0;
        newPinOrder = maxPinOrder + 1;
      }

      const { error } = await supabase
        .from('churches')
        .update({ is_pinned: isPinned, pin_order: newPinOrder })
        .eq('id', churchId);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      showSuccess('Estado de anclaje de la iglesia actualizado con éxito.');
      queryClient.invalidateQueries({ queryKey: ['churches'] });
    },
    onError: (err) => {
      showError(err.message || 'Error al actualizar el estado de anclaje de la iglesia.');
    },
  });

  const isAdminOrGeneral = profile?.role === 'admin' || profile?.role === 'general';

  if (isLoading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Iglesias</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4"> {/* Adjusted grid */}
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    showError(error?.message || 'Error al cargar las iglesias.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar las iglesias.'}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Iglesias</h1>
        {isAdminOrGeneral && ( // Only show Add Church button for admin/general
          <Dialog open={isAddChurchDialogOpen} onOpenChange={setIsAddChurchDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva Iglesia
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Añadir Nueva Iglesia</DialogTitle>
                <DialogDescription>
                  Introduce los detalles de la nueva iglesia aquí.
                </DialogDescription>
              </DialogHeader>
              <AddChurchDialog onOpenChange={setIsAddChurchDialogOpen} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4"> {/* Adjusted grid */}
        {churches && churches.length > 0 ? (
          churches.map((church) => (
            <ChurchCard
              key={church.id}
              church={church}
              onEdit={handleEditChurch}
              onDelete={handleDeleteChurch}
              onPinToggle={pinChurchMutation.mutate}
              currentUserChurchId={profile?.church_id} // Pass current user's church ID
              currentUserRole={profile?.role} // Pass current user's role
            />
          ))
        ) : (
          <Card className="col-span-full text-center py-8">
            <CardHeader>
              <CardTitle>No hay iglesias registradas</CardTitle>
              <CardDescription>
                {isAdminOrGeneral ? 'Haz clic en "Añadir Nueva Iglesia" para empezar.' : 'Ponte en contacto con un administrador para ser asignado a una iglesia.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Optional: Add an icon or illustration here */}
            </CardContent>
          </Card>
        )}
      </div>

      <EditChurchNameDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        church={selectedChurch}
      />

      <DeleteChurchConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        churchId={churchToDelete?.id || null}
        churchName={churchToDelete?.name || null}
      />
    </div>
  );
};

export default ChurchesPage;