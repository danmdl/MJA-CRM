import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { SessionProvider } from "./components/SessionProvider";
import { MadeWithDyad } from "./components/made-with-dyad";
import { ThemeProvider } from "next-themes";
import AppContent from "./AppContent"; // Import the new AppContent component

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <div className="min-h-screen flex flex-col">
              <main className="flex-grow">
                <AppContent /> {/* Render AppContent here */}
              </main>
              <MadeWithDyad />
            </div>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;