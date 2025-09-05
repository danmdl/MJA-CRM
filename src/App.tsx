import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import { MadeWithDyad } from "./components/made-with-dyad";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { session, loading } = useSession();

  if (loading) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div>Loading...</div>
        </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/" 
        element={session ? <Index /> : <Navigate to="/login" replace />} 
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider>
          <div className="min-h-screen flex flex-col">
            <main className="flex-grow">
              <AppRoutes />
            </main>
            <MadeWithDyad />
          </div>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;