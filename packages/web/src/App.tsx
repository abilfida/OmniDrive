import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { useAuthStore } from './stores/authStore';
export const SetupGuard = ({ children, isSetup }: { children: React.ReactNode, isSetup: boolean }) => {
  if (isSetup === false) return <Navigate to="/setup" replace />;
  return <>{children}</>;
};

// Pages load on demand, so the first visit doesn't download every screen.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FilesPage = lazy(() => import('./pages/FilesPage').then((m) => ({ default: m.FilesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SharedLinksPage = lazy(() => import('./pages/SharedLinksPage').then((m) => ({ default: m.SharedLinksPage })));
const PublicSharedPage = lazy(() => import('./pages/PublicSharedPage').then((m) => ({ default: m.PublicSharedPage })));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const TrashPage = lazy(() => import('./pages/TrashPage').then((m) => ({ default: m.TrashPage })));
const StarredPage = lazy(() => import('./pages/StarredPage').then((m) => ({ default: m.StarredPage })));
const WorkspacesPage = lazy(() => import('./pages/WorkspacesPage').then((m) => ({ default: m.WorkspacesPage })));
const SetupPage = lazy(() => import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));

// The admin API re-checks permissions; this only keeps members off a page
// whose every request would fail.
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  if (user?.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PageLoading = () => (
  <div className="flex items-center justify-center p-16" role="status" aria-label="Loading">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
    <h2 className="text-lg font-semibold text-gray-800">Page not found</h2>
    <p className="text-sm text-gray-500">The page you were looking for doesn't exist.</p>
    <Link to="/" className="text-sm font-medium text-blue-600 hover:underline">Go to the dashboard</Link>
  </div>
);

export const App = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const checkSetupStatus = () => {
    setSetupError(null);
    setIsSetup(null);
    api.getSetupStatus()
      .then(res => setIsSetup(res.isSetup))
      .catch(err => setSetupError(err.message || 'Failed to connect to server'));
  };

  useEffect(() => {
    checkSetupStatus();
  }, []);

  if (setupError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <h2>Connection Error</h2>
        <p>{setupError}</p>
        <button onClick={checkSetupStatus} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', background: '#fff' }}>Retry</button>
      </div>
    );
  }

  if (isSetup === null) return null; // loading state

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/setup" element={isSetup ? <Navigate to="/login" /> : <SetupPage />} />
        <Route path="/login" element={!isSetup ? <Navigate to="/setup" /> : <LoginPage />} />
        <Route path="/shared/:id" element={<PublicSharedPage />} />
        <Route
          element={
            <SetupGuard isSetup={isSetup}>
              <AuthGuard>
                <AppLayout />
                <ToastContainer />
              </AuthGuard>
            </SetupGuard>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:folderId" element={<FilesPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/settings/drives" element={<SettingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/shared" element={<SharedLinksPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/starred" element={<StarredPage />} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
