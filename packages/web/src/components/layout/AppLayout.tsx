import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelectionStore } from '../../stores/useSelectionStore';

export const AppLayout = () => {
  const location = useLocation();
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  useEffect(() => {
    clearSelection();
  }, [location.pathname, location.search, clearSelection]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
    </div>
  );
};
