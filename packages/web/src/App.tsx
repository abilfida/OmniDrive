import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { FilesPage } from './pages/FilesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SharedLinksPage } from './pages/SharedLinksPage';
import { PublicSharedPage } from './pages/PublicSharedPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { SearchPage } from './pages/SearchPage';
import { TrashPage } from './pages/TrashPage';
import { StarredPage } from './pages/StarredPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { SetupPage } from './pages/SetupPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { api } from './lib/api';
export const SetupGuard = ({ children, isSetup }: { children: React.ReactNode, isSetup: boolean }) => {
  if (isSetup === false) return <Navigate to="/setup" replace />;
  return <>{children}</>;
};

export const App = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    api.getSetupStatus().then(res => setIsSetup(res.isSetup)).catch(() => setIsSetup(true));
  }, []);

  if (isSetup === null) return null; // loading state

  return (
    <BrowserRouter>
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
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
