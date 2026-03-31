import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'warning' | 'info' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 200);
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 200);
  }, []);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={16} className="text-green-400" />,
    warning: <AlertTriangle size={16} className="text-yellow-400" />,
    info: <Info size={16} className="text-blue-400" />,
    error: <AlertTriangle size={16} className="text-red-400" />,
  };

  const borderColors: Record<ToastType, string> = {
    success: 'border-l-green-500',
    warning: 'border-l-yellow-500',
    info: 'border-l-blue-500',
    error: 'border-l-red-500',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-neutral-800 border border-neutral-700 border-l-2 ${borderColors[t.type]} rounded-lg shadow-xl shadow-black/30 min-w-[280px] max-w-[400px] ${t.exiting ? 'toast-exit' : 'toast-enter'}`}
          >
            {icons[t.type]}
            <span className="text-sm text-neutral-200 flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-neutral-500 hover:text-neutral-300 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
