import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  const { session } = useSession();

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold">¡Bienvenido!</CardTitle>
          <CardDescription className="text-xl text-muted-foreground">
            Has iniciado sesión correctamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session && (
            <p className="text-md text-muted-foreground mb-4">
              Sesión iniciada como: {session.user.email}
            </p>
          )}
          <Button asChild>
            <Link to="/profile">Ir al Perfil</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;