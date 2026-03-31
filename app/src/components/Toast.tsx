import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'warning' | 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => undefined,
});

let toastId = 0;

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 200);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++toastId;
      setToasts((current) => [...current, { id, message, type }]);

      window.setTimeout(() => {
        dismiss(id);
      }, 3200);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      toast,
    }),
    [toast],
  );

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={16} className="text-green-400" />,
    warning: <AlertTriangle size={16} className="text-yellow-400" />,
    info: <Info size={16} className="text-blue-400" />,
    error: <AlertTriangle size={16} className="text-red-400" />,
  };

  const borderMap: Record<ToastType, string> = {
    success: 'border-l-green-500',
    warning: 'border-l-yellow-500',
    info: 'border-l-blue-500',
    error: 'border-l-red-500',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-neutral-700 border-l-4 ${borderMap[item.type]} bg-neutral-900 px-4 py-3 shadow-2xl shadow-black/30 transition-opacity duration-200 ${
              item.exiting ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {iconMap[item.type]}
            <span className="flex-1 text-sm text-neutral-200">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="text-neutral-500 transition-colors hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
