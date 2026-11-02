import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';
import type { ToastType } from '../types';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error: <AlertCircle size={18} className="text-red-500" />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info: <Info size={18} className="text-blue-500" />,
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  // Always rendered: screen readers only announce changes to a live region that
  // already exists, so mounting it together with the first toast is too late.
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-lg pointer-events-auto min-w-[300px] animate-in slide-in-from-bottom-5 fade-in duration-300"
        >
          {icons[toast.type]}
          <span className="flex-1 text-sm font-medium text-gray-700">{toast.message}</span>
          <button 
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" 
            onClick={() => removeToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
