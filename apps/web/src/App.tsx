import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { AccountActionPage } from "./pages/AccountActionPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrganizationAdminPage } from "./pages/OrganizationAdminPage";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { RequisitionsPage } from "./pages/RequisitionsPage";
import { SupplierRfqPage } from "./pages/SupplierRfqPage";
import { SupplierQuotePage } from "./pages/SupplierQuotePage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
export default function App() {
 const { loading } = useAuth();
 if (loading) return <div className="auth-loading">Securing your ProcuraOS workspace…</div>;
 return <Routes>
  <Route path="/supplier-quote/:rfqId" element={<SupplierQuotePage />} />
  <Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} />
  <Route path="/verify-email" element={<AccountActionPage mode="verify" />} /><Route path="/forgot-password" element={<AccountActionPage mode="forgot" />} /><Route path="/reset-password" element={<AccountActionPage mode="reset" />} />
  <Route element={<ProtectedRoute />}>
   <Route path="/" element={<DashboardPage />} /><Route path="/settings" element={<OrganizationAdminPage />} />
   <Route path="/accept-invite" element={<AcceptInvitationPage />} /><Route path="/requisitions" element={<RequisitionsPage />} />
   <Route path="/suppliers" element={<SupplierRfqPage />} /><Route path="/purchase-orders" element={<PurchaseOrdersPage />} /><Route path="/invoices" element={<InvoicesPage />} /><Route path="/payments" element={<PaymentsPage />} />
  </Route><Route path="*" element={<Navigate to="/" replace />} />
 </Routes>;
}
