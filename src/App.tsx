import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login"; // Importar la página de Login
import Dashboard from "./pages/admin/Dashboard"; // Importar la página de Dashboard
import Profile from "./pages/admin/Profile"; // Importar la página de Profile
import ManageTeam from "./pages/admin/ManageTeam"; // Importar la página de ManageTeam
import DatabasePage from "./pages/admin/DatabasePage"; // Importar la página de DatabasePage
import { SessionProvider } from "./components/auth/SessionProvider"; // Importar el SessionProvider

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider> {/* Envolver las rutas con SessionProvider */}
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} /> {/* Ruta para el login */}
            {/* Rutas protegidas para el panel de administración */}
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/profile" element={<Profile />} />
            <Route path="/admin/manage-team" element={<ManageTeam />} />
            <Route path="/admin/database" element={<DatabasePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;