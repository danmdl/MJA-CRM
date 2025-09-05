import { NavLink } from 'react-router-dom';
import { Settings } from 'lucide-react'; // Usaremos un icono de ajustes como ejemplo

const SidebarFooter = () => {
  return (
    <div className="mt-auto p-2 border-t"> {/* mt-auto empuja este div al final */}
      <NavLink
        to="/admin/settings" // Puedes cambiar esta ruta si tienes una página de ajustes
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary ${
            isActive ? 'bg-muted text-primary' : ''
          }`
        }
      >
        <Settings className="h-4 w-4" />
        MJA CENTRAL
      </NavLink>
    </div>
  );
};

export default SidebarFooter;