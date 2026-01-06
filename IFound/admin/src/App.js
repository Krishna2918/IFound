import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import CasesPage from './pages/CasesPage';
import SubmissionsPage from './pages/SubmissionsPage';
import TransactionsPage from './pages/TransactionsPage';
import MatchesPage from './pages/MatchesPage';
import FraudAlertsPage from './pages/FraudAlertsPage';
import VerificationRequestsPage from './pages/VerificationRequestsPage';
import SystemHealthPage from './pages/SystemHealthPage';
import UserDashboard from './pages/UserDashboard';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-gray-800 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If admin-only route and user is not admin, redirect to user dashboard
  if (adminOnly && user.user_type !== 'admin') {
    return <Navigate to="/user" replace />;
  }

  return children;
}

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  // Determine where to redirect after login
  const getHomeRedirect = () => {
    if (!user) return '/login';
    return user.user_type === 'admin' ? '/admin' : '/user';
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={getHomeRedirect()} replace /> : <LoginPage />}
      />

      {/* User Dashboard - for regular users */}
      <Route
        path="/user"
        element={
          <ProtectedRoute>
            <UserDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cases"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <CasesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/submissions"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <SubmissionsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <TransactionsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/matches"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <MatchesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/fraud-alerts"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <FraudAlertsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/verification"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <VerificationRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/system-health"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <SystemHealthPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Default redirect based on user type */}
      <Route path="/" element={<Navigate to={user ? getHomeRedirect() : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
