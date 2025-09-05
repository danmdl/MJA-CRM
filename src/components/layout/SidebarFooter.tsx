import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/ModeToggle';
import { supabase } from '@/integrations/supabase/client';

const SidebarFooter = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="p-4 border-t mt-auto">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="mja-central" className="border-b-0">
          <AccordionTrigger className="flex items-center justify-between w-full px-3 py-2 text-muted-foreground hover:text-primary hover:no-underline">
            <span className="font-bold text-lg">MJA CENTRAL</span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="flex flex-col space-y-2 pl-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Tema</span>
                <ModeToggle />
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-primary"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Cerrar Sesión
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default SidebarFooter;