import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PropertyProvider } from './context/PropertyContext';
import { useProperty } from './context/PropertyContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SiteVisitModal } from './components/SiteVisitModal';
import { EMICalculatorModal } from './components/EMICalculatorModal';

import { HomePage } from './pages/HomePage';
import { PropertiesPage } from './pages/PropertiesPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { CustomerShortlistPage } from './pages/CustomerShortlistPage';
import { CustomerVisitsPage } from './pages/CustomerVisitsPage';
import { PropertyComparisonPage } from './pages/PropertyComparisonPage';
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage';
import { SalesDashboardPage } from './pages/SalesDashboardPage';
import { ManagerDashboardPage } from './pages/ManagerDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { LeadLookupPage } from './pages/LeadLookupPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: UserRole[] }> = ({ children, roles }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="page-wrapper" role="status">Loading account…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const SiteVisitModalHost: React.FC = () => {
  const { siteVisitProperty, siteVisitConversationId } = useProperty();
  return <SiteVisitModal key={`${siteVisitProperty?.id ?? 'closed'}-${siteVisitConversationId ?? ''}`} />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <PropertyProvider>
        <Router>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
            <Navbar />
            <main style={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/properties" element={<PropertiesPage />} />
                <Route path="/properties/:id" element={<PropertyDetailPage />} />
                <Route path="/ai" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />

                {/* Lead Routes (CRM record information & enquiry tracking) */}
                <Route path="/lead/status" element={<LeadLookupPage />} />
                <Route path="/lead/tracker" element={<LeadLookupPage />} />
                <Route path="/lead" element={<Navigate to="/lead/status" replace />} />

                {/* Customer Routes */}
                <Route path="/customer" element={<Navigate to="/customer/shortlist" replace />} />
                <Route path="/customer/shortlist" element={<ProtectedRoute><CustomerShortlistPage /></ProtectedRoute>} />
                <Route path="/customer/visits" element={<ProtectedRoute><CustomerVisitsPage /></ProtectedRoute>} />
                <Route path="/customer/compare" element={<ProtectedRoute><PropertyComparisonPage /></ProtectedRoute>} />

                {/* Sales Agent Routes */}
                <Route path="/sales" element={<Navigate to="/sales/dashboard" replace />} />
                <Route
                  path="/sales/dashboard"
                  element={
                    <ProtectedRoute roles={['sales_agent', 'employee', 'manager', 'admin', 'super_admin']}>
                      <SalesDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Employee CRM Routes (Preserving backwards compatibility) */}
                <Route path="/employee" element={<Navigate to="/sales/dashboard" replace />} />
                <Route
                  path="/employee/leads"
                  element={
                    <ProtectedRoute roles={['employee', 'sales_agent', 'manager', 'admin', 'super_admin']}>
                      <SalesDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/employee/customers"
                  element={
                    <ProtectedRoute roles={['employee', 'sales_agent', 'manager', 'admin', 'super_admin']}>
                      <EmployeeDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/employee/analytics"
                  element={
                    <ProtectedRoute roles={['employee', 'sales_agent', 'manager', 'admin', 'super_admin']}>
                      <EmployeeDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Manager Workspace Routes */}
                <Route path="/manager" element={<Navigate to="/manager/dashboard" replace />} />
                <Route
                  path="/manager/dashboard"
                  element={
                    <ProtectedRoute roles={['manager', 'admin', 'super_admin']}>
                      <ManagerDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Admin Routes */}
                <Route path="/admin" element={<Navigate to="/admin/analytics" replace />} />
                <Route
                  path="/admin/dashboard"
                  element={
                    <ProtectedRoute roles={['admin', 'super_admin']}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <ProtectedRoute roles={['admin', 'super_admin']}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <ProtectedRoute roles={['admin', 'super_admin']}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/properties"
                  element={
                    <ProtectedRoute roles={['admin', 'super_admin']}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Super Admin Routes */}
                <Route path="/super-admin" element={<Navigate to="/super-admin/dashboard" replace />} />
                <Route
                  path="/super-admin/dashboard"
                  element={
                    <ProtectedRoute roles={['super_admin']}>
                      <SuperAdminDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Auth & Role Login Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/login/customer" element={<LoginPage />} />
                <Route path="/login/sales" element={<LoginPage />} />
                <Route path="/login/manager" element={<LoginPage />} />
                <Route path="/login/admin" element={<LoginPage />} />
                <Route path="/login/super-admin" element={<LoginPage />} />
                <Route path="/login/lead" element={<LeadLookupPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />

            {/* Global Modals */}
            <SiteVisitModalHost />
            <EMICalculatorModal />
          </div>
        </Router>
      </PropertyProvider>
    </AuthProvider>
  );
};

export default App;
