import { useState, useEffect } from 'react';
import { waitForBackend } from '../utils/api';

export default function LoadingScreen({ onReady }) {
  const [pct, setPct] = useState(5);
  const [msg, setMsg] = useState('Conectando...');
  const [done, setDone] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    waitForBackend((p, m) => { setPct(p); setMsg(m); }).then(ok => {
      if (ok) { setDone(true); setTimeout(() => onReady(), 600); }
    });
  }, [onReady]);

  // Animated dots
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(id);
  }, [done]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center transition-opacity duration-500 ${done ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {/* Animated icon */}
      <div className="relative mb-8">
        <div className={`bg-primary p-4 rounded-2xl ${done ? '' : 'animate-pulse'}`}>
          <span className="material-symbols-outlined text-white text-4xl fill-1">receipt_long</span>
        </div>
        {!done && (
          <div className="absolute -inset-2 rounded-3xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        )}
      </div>

      <p className="text-xl font-bold text-slate-800 mb-1">Gestión Facturas</p>
      <p className="text-sm text-slate-400 mb-8">{done ? 'Conectado' : msg}{!done ? dots : ' ✓'}</p>

      {/* Progress bar */}
      <div className="w-56 h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${done ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Subtle animated shimmer on the bar when loading */}
      {!done && pct < 100 && (
        <style>{`
          @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        `}</style>
      )}

      <p className="text-[11px] text-slate-300 font-medium">
        {done ? 'Listo' : pct < 30 ? 'Despertando servidor...' : pct < 70 ? 'Cargando servicios...' : 'Casi listo...'}
      </p>
    </div>
  );
}