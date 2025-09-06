import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/ModeToggle';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SidebarFooterProps {
  isCollapsed: boolean;
  dynamicTitle?: string; // New prop for dynamic title
}

const SidebarFooter = ({ isCollapsed, dynamicTitle }: SidebarFooterProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const titleToDisplay = dynamicTitle || "MJA CENTRAL";

  return (
    <div className="p-4 border-t mt-auto">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="mja-central" className="border-b-0">
          <AccordionTrigger className={cn(
            "flex items-start justify-between w-full px-3 py-4 text-muted-foreground hover:text-primary hover:no-underline h-auto min-h-0", // Changed items-center to items-start, py-3 to py-4, added h-auto and min-h-0
            isCollapsed ? "justify-center" : "justify-between"
          )}>
            {isCollapsed ? (
              <Settings className="h-6 w-6 text-primary" />
            ) : (
              <span className="font-bold text-lg break-words">
                {titleToDisplay}
              </span>
            )}
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className={cn(
              "flex flex-col space-y-2",
              isCollapsed ? "items-center" : "pl-4"
            )}>
              <div className={cn(
                "flex items-center",
                isCollapsed ? "justify-center" : "justify-between py-2"
              )}>
                {!isCollapsed && <span className="text-sm text-muted-foreground">Tema</span>}
                <ModeToggle />
              </div>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-muted-foreground hover:text-primary",
                  isCollapsed && "justify-center"
                )}
                onClick={handleLogout}
              >
                <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
                {!isCollapsed && 'Cerrar Sesión'}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default SidebarFooter;