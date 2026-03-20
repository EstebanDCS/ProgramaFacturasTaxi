import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';
import { esc, descargarBlob } from '../utils/helpers';

export default function Historial({ onEditFactura }) {
  const { token } = useAuth();
  const toast = useToast();
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_URL}/historial`, { headers: authHeaders(token) });
      setFacturas(await r.json());
    } catch { toast('Error cargando historial', 'error'); }
    setLoading(false);
  }, [token, toast]);

  useEffect(() => { if (token) cargar(); }, [token, cargar]);

  const eliminar = async (id) => {
    if (!confirm('¿Borrar factura?')) return;
    await apiFetch(`${API_URL}/eliminar-factura/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    cargar();
  };

  const vaciar = async () => {
    if (!confirm('¿Vaciar todo el historial?')) return;
    await apiFetch(`${API_URL}/limpiar-historial`, { method: 'DELETE', headers: authHeaders(token) });
    cargar();
  };

  const descargar = async (id, formato = 'pdf') => {
    try {
      const r = await apiFetch(`${API_URL}/re-descargar/${id}?formato=${formato}`, { headers: authHeaders(token) });
      if (r.ok) descargarBlob(await r.blob(), r.headers.get('Content-Disposition'), `Fra_${id}`, formato);
      else toast('Error al descargar', 'error');
    } catch { toast('Error de conexión', 'error'); }
  };

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Historial</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Facturas almacenadas de forma segura</p>
        </div>
        <button onClick={vaciar} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-lg">delete_sweep</span> Vaciar
        </button>
      </header>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Fecha', 'Plantilla', 'Nº Fra.', 'Importe', 'Acciones'].map(h => (
                <th key={h} className={`px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] ${h === 'Acciones' ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && <tr><td colSpan={5} className="px-6 py-6 text-center text-slate-500">Cargando...</td></tr>}
            {!loading && !facturas.length && <tr><td colSpan={5} className="px-6 py-6 text-center text-slate-500">No hay facturas.</td></tr>}
            {facturas.map(f => (
              <tr key={f.id} className="hover:bg-slate-50/80">
                <td className="px-6 py-4 text-sm font-medium text-slate-600">{new Date(f.fecha_creacion).toLocaleDateString('es-ES')}</td>
                <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-primary uppercase tracking-wider">{f.barco || f.plantilla_nombre || '-'}</span></td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-900">{f.numero_factura}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-900">{f.importe_total.toFixed(2)}€</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onEditFactura && onEditFactura(f.id)} className="text-amber-500 hover:text-amber-700 p-1" title="Editar">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onClick={() => descargar(f.id, 'pdf')} className="text-primary hover:text-blue-800 p-1" title="Descargar">
                      <span className="material-symbols-outlined text-lg">download</span>
                    </button>
                    <button onClick={() => eliminar(f.id)} className="text-slate-400 hover:text-red-500 p-1" title="Eliminar">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
