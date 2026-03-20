import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const ICONS = { success: 'check_circle', error: 'error', warn: 'warning', info: 'info' };
const COLORS = {
  success: 'bg-emerald-800 text-emerald-100',
  error: 'bg-red-900 text-red-100',
  warn: 'bg-amber-800 text-amber-100',
  info: 'bg-slate-800 text-slate-100',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9000] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3 rounded-xl font-semibold text-sm shadow-lg max-w-[380px] ${COLORS[t.type]}`}
               style={{ animation: 'toastIn .3s ease' }}>
            <span className="material-symbols-outlined fill-1" style={{ fontSize: 18 }}>{ICONS[t.type]}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
