import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';

export default function Admin() {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [system, setSystem] = useState(null);

  useEffect(() => { if (token) cargar(); }, [token]);

  const cargar = async () => {
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        apiFetch(`${API_URL}/admin/stats`, { headers: authHeaders(token) }),
        apiFetch(`${API_URL}/admin/users`, { headers: authHeaders(token) }),
        apiFetch(`${API_URL}/admin/activity`, { headers: authHeaders(token) }),
        apiFetch(`${API_URL}/admin/system`, { headers: authHeaders(token) }),
      ]);
      if (r1.ok) setStats(await r1.json());
      if (r2.ok) setUsers(await r2.json());
      if (r3.ok) setActivity(await r3.json());
      if (r4.ok) setSystem(await r4.json());
    } catch { toast('Error cargando admin', 'error'); }
  };

  const toggleUser = async (uid) => {
    try {
      const r = await apiFetch(`${API_URL}/admin/users/${uid}/toggle`, { method: 'PUT', headers: authHeaders(token) });
      if (r.ok) cargar();
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error', 'error'); }
  };

  const TABS = ['stats', 'users', 'activity', 'system'];
  const LABELS = { stats: 'Estadísticas', users: 'Usuarios', activity: 'Actividad', system: 'Sistema' };

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="mb-6 pb-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-500 text-2xl">admin_panel_settings</span> Panel Admin
        </h2>
      </header>

      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === t ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
            {LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Facturas</p><p className="text-3xl font-extrabold text-primary">{stats.total_facturas}</p></div>
            <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Usuarios</p><p className="text-3xl font-extrabold text-emerald-600">{stats.usuarios_unicos}</p></div>
            <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Hoy</p><p className="text-3xl font-extrabold text-amber-600">{stats.facturas_hoy}</p></div>
            <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Plantillas</p><p className="text-3xl font-extrabold text-violet-600">{stats.total_plantillas}</p></div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b"><tr>
              {['User ID', 'Facturas', 'Plantillas', 'Última actividad', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.user_id} className="border-b border-slate-50 hover:bg-slate-50/80">
                <td className="px-4 py-3 text-xs font-mono text-slate-500">{u.user_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-sm font-bold">{u.facturas}</td>
                <td className="px-4 py-3 text-sm">{u.plantillas}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.ultima_actividad ? new Date(u.ultima_actividad).toLocaleDateString('es-ES') : '-'}</td>
                <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.disabled ? 'Desactivado' : 'Activo'}</span></td>
                <td className="px-4 py-3"><button onClick={() => toggleUser(u.user_id)} className="text-xs font-bold text-primary hover:underline">{u.disabled ? 'Activar' : 'Desactivar'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b sticky top-0"><tr>
              {['Fecha', 'User', 'Acción', 'Detalle'].map(h => (
                <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>{activity.map(a => (
              <tr key={a.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(a.created_at).toLocaleString('es-ES')}</td>
                <td className="px-4 py-2 text-xs font-mono text-slate-500">{a.user_id.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs font-bold text-slate-700">{a.accion}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{a.meta}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'system' && system && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Facturas en BD</p><p className="text-2xl font-extrabold">{system.facturas_en_bd}</p></div>
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Plantillas en BD</p><p className="text-2xl font-extrabold">{system.plantillas_en_bd}</p></div>
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Logs</p><p className="text-2xl font-extrabold">{system.logs_en_bd}</p></div>
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Temp files</p><p className="text-2xl font-extrabold">{system.temp_files_mb} MB</p></div>
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Server time</p><p className="text-sm font-mono">{system.server_time}</p></div>
          <div className="stat-card"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Admins</p><p className="text-sm font-mono">{system.admin_emails?.join(', ')}</p></div>
        </div>
      )}
    </div>
  );
}
