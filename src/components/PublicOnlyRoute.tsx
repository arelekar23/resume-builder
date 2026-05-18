import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function PublicOnlyRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
