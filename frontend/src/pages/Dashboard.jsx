import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch(`${API_URL}/user/stats`, { headers: authHeaders(token) })
      .then(r => r.json()).then(setStats).catch(() => {});
  }, [token]);

  if (!stats) return <div className="animate-fadeIn p-8 text-slate-400">Cargando dashboard...</div>;

  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const maxCount = Math.max(...(stats.facturas_por_mes || []).map(x => x.count), 1);
  const maxP = Math.max(...(stats.por_plantilla || []).map(x => x.count), 1);

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <h2 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Facturas</p><p className="text-3xl font-extrabold text-primary">{stats.total_facturas}</p></div>
        <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Este mes</p><p className="text-3xl font-extrabold text-emerald-600">{stats.facturas_este_mes}</p></div>
        <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Importe total</p><p className="text-2xl font-extrabold text-slate-900">{stats.total_importe.toLocaleString("es-ES", {minimumFractionDigits:2})} €</p></div>
        <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Plantillas</p><p className="text-3xl font-extrabold text-violet-600">{stats.total_plantillas}</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Facturas por mes</h3>
          <div className="flex items-end gap-1 h-32">
            {(stats.facturas_por_mes || []).map(x => {
              const p = Math.max(x.count / maxCount * 100, 4);
              const m = meses[parseInt(x.mes.split("-")[1]) - 1];
              return <div key={x.mes} className="flex-1 flex flex-col items-center justify-end h-full">
                <p className="text-[10px] font-bold text-slate-500 mb-1">{x.count}</p>
                <div className="w-full rounded-t-lg bg-primary/80 hover:bg-primary transition-colors" style={{height:`${p}%`}} />
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">{m}</p>
              </div>;
            })}
            {!(stats.facturas_por_mes || []).length && <p className="text-sm text-slate-400 m-auto">Sin datos</p>}
          </div>
        </div>
        <div className="stat-card">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Uso por plantilla</h3>
          <div className="space-y-2">
            {(stats.por_plantilla || []).map(x => (
              <div key={x.nombre} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 w-24 truncate">{x.nombre}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2"><div className="bg-amber-400 h-2 rounded-full" style={{width:`${x.count/maxP*100}%`}} /></div>
                <span className="text-xs text-slate-500 w-8 text-right">{x.count}</span>
              </div>
            ))}
            {!(stats.por_plantilla || []).length && <p className="text-sm text-slate-400">Sin datos</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
