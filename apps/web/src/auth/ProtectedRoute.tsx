import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-loading">Restoring your secure session…</div>;
  return user.id ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}
