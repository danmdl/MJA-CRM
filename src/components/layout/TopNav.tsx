"use client";

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/ModeToggle';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const TopNav = () => {
  const { profile } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b bg-background">
      <Link to="/admin/dashboard" className="text-xl font-bold text-primary hover:text-primary-foreground transition-colors">
        MJA Admin
      </Link>
      <div className="flex items-center space-x-4">
        {profile && (
          <span className="text-sm text-muted-foreground hidden md:block">
            Hola, {profile.first_name || profile.email}
          </span>
        )}
        <ModeToggle />
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar Sesión
        </Button>
      </div>
    </nav>
  );
};

export default TopNav;