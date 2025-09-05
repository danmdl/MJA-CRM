import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { session } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white shadow-md rounded-lg">
        <h1 className="text-4xl font-bold mb-4">Welcome!</h1>
        <p className="text-xl text-gray-600 mb-6">
          You are successfully logged in.
        </p>
        {session && (
          <p className="text-md text-gray-500 mb-8">
            Logged in as: {session.user.email}
          </p>
        )}
        <Button onClick={handleLogout}>Logout</Button>
      </div>
    </div>
  );
};

export default Index;