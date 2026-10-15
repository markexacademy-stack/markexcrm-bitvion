import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/ui';
import { LoginPage, NotFoundPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { StudentsPage } from '@/pages/Students';
import { SpendingPage } from '@/pages/Spending';
import { MailPage } from '@/pages/Mail';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unsubscribe/:token" element={<Navigate to="/login" replace />} />
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/spending" element={<SpendingPage />} />
        <Route path="/mail" element={<MailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
