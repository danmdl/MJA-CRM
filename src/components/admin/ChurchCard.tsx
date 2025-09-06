"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Church, Users, Database, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ChurchProps {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
}

interface ChurchCardProps {
  church: ChurchProps;
}

const ChurchCard = ({ church }: ChurchCardProps) => {
  // In a real app, you might fetch pastor's name using pastor_id
  const pastorName = church.pastor_id ? `Pastor ID: ${church.pastor_id.substring(0, 8)}...` : 'No asignado';

  return (
    <Card className="flex flex-col justify-between h-full">
      <CardHeader>
        <div className="flex items-center space-x-3 mb-2">
          <Church className="h-6 w-6 text-primary" />
          <CardTitle className="text-xl">{church.name}</CardTitle>
        </div>
        <CardDescription>
          {pastorName}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col space-y-2">
        <Button variant="outline" asChild>
          <Link to={`/admin/churches/${church.id}/database`} className="flex items-center justify-start">
            <Database className="mr-2 h-4 w-4" /> Gestionar Base de Datos
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/admin/churches/${church.id}/team`} className="flex items-center justify-start">
            <Users className="mr-2 h-4 w-4" /> Gestionar Equipo
          </Link>
        </Button>
        <Button asChild>
          <Link to={`/admin/churches/${church.id}/details`} className="flex items-center justify-center">
            Ver Detalles <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default ChurchCard;