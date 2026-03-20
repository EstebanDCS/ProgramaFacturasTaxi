import { useState, useEffect } from 'react';
import { waitForBackend } from '../utils/api';

export default function LoadingScreen({ onReady }) {
  const [pct, setPct] = useState(10);
  const [msg, setMsg] = useState('Conectando...');
  const [done, setDone] = useState(false);

  useEffect(() => {
    waitForBackend((p, m) => { setPct(p); setMsg(m); }).then(ok => {
      if (ok) { setDone(true); setTimeout(() => onReady(), 500); }
    });
  }, [onReady]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center transition-opacity duration-300 ${done ? 'opacity-0' : 'opacity-100'}`}>
      <div className="bg-primary p-3 rounded-xl mb-6">
        <span className="material-symbols-outlined text-white text-3xl fill-1">receipt_long</span>
      </div>
      <p className="text-lg font-bold text-slate-800 mb-2">Conectando con el servidor</p>
      <p className="text-sm text-slate-400 mb-6">{msg}</p>
      <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
