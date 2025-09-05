import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "Error 404: El usuario intentó acceder a una ruta inexistente:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background"> {/* Usar bg-background */}
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">¡Vaya! Página no encontrada</p> {/* Usar text-muted-foreground */}
        <a href="/" className="text-primary hover:underline"> {/* Usar text-primary */}
          Volver al Inicio
        </a>
      </div>
    </div>
  );
};

export default NotFound;