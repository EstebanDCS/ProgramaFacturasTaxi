// Plantillas page - stub for Phase 3.0
// Full migration of template list, preview, edit, delete

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';

export default function Plantillas({ onCrear, onEditar }) {
  const { token } = useAuth();
  const toast = useToast();
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_URL}/plantillas`, { headers: authHeaders(token) });
      setPlantillas(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (token) cargar(); }, [token]);

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar plantilla?')) return;
    await apiFetch(`${API_URL}/plantillas/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    toast('Plantilla eliminada', 'success');
    cargar();
  };

  const preview = async (id) => {
    try {
      const r = await apiFetch(`${API_URL}/plantillas/${id}/preview`, { method: 'POST', headers: authHeaders(token) });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else toast('Error en preview', 'error');
    } catch { toast('Error de conexión', 'error'); }
  };

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200">
        <div><h2 className="text-2xl font-bold">Mis Plantillas</h2><p className="text-slate-500 text-sm mt-1">Modelos de factura</p></div>
        <button onClick={onCrear} className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm">
          <span className="material-symbols-outlined text-lg">add</span> Nueva Plantilla
        </button>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading && <p className="col-span-3 text-center text-slate-400 py-12">Cargando...</p>}
        {!loading && !plantillas.length && (
          <div className="col-span-3 text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-200 mb-4 block">draft</span>
            <p className="text-slate-400 font-medium">No hay plantillas</p>
          </div>
        )}
        {plantillas.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="h-28 bg-slate-50 border-b border-slate-100 flex items-center justify-center text-slate-300">
              <span className="material-symbols-outlined text-3xl">table_view</span>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${p.tipo === 'visual' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.tipo}</span>
                <span className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString('es-ES')}</span>
              </div>
              <h3 className="font-bold text-slate-900 mb-3">{p.nombre}</h3>
              <div className="flex items-center gap-1.5">
                <button onClick={() => preview(p.id)} className="flex-1 text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors">
                  <span className="material-symbols-outlined text-sm">visibility</span> Preview
                </button>
                <button onClick={() => onEditar && onEditar(p.id)} className="flex-1 text-[11px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors">
                  <span className="material-symbols-outlined text-sm">edit</span> Editar
                </button>
                <button onClick={() => eliminar(p.id)} className="text-slate-400 hover:text-red-500 p-1.5 transition-colors">
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
