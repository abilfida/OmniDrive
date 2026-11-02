import { useUIStore } from '../../stores/useUIStore';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ErrorBoundary';
import { InfoPanel } from './InfoPanel';

export const MainContent: React.FC = () => {
  const isInfoPanelOpen = useUIStore((state) => state.isInfoPanelOpen);
  const { pathname } = useLocation();

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-surface">
      <main className="flex-1 bg-white rounded-xl m-2 shadow-sm overflow-y-auto">
        {/* A page that fails to render keeps the sidebar usable; navigating away recovers. */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      
      {isInfoPanelOpen && (
        <ErrorBoundary resetKey={pathname}>
          <InfoPanel />
        </ErrorBoundary>
      )}
    </div>
  );
};
