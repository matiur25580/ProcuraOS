import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrganizationAdminPage } from "./pages/OrganizationAdminPage";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="auth-loading">Securing your ProcuraOS workspace…</div>;
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings" element={<OrganizationAdminPage />} />
        <Route path="/accept-invite" element={<AcceptInvitationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
