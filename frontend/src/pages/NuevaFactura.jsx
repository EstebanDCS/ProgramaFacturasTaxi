import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL, COL_PRESETS } from '../config';
import { evalFormulaClient, descargarBlob } from '../utils/helpers';
import DownloadModal from '../components/DownloadModal';

export default function NuevaFactura({ editingId, onClearEdit }) {
  const { token } = useAuth();
  const toast = useToast();
  const [plantillas, setPlantillas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig] = useState(null);
  const [nombre, setNombre] = useState('');
  const [form, setForm] = useState({ numero_factura: '', fecha: '', referencia: '', notas: '' });
  const [cliente, setCliente] = useState({ nombre: '', cif: '', direccion: '', email: '', telefono: '' });
  const [lineas, setLineas] = useState([{}]);
  const [step, setStep] = useState('selector');
  const [showDownload, setShowDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cargarPlantillas = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_URL}/plantillas`, { headers: authHeaders(token) });
      return await r.json();
    } catch { return []; }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    cargarPlantillas().then(data => {
      setPlantillas(data);
    });
  }, [token, cargarPlantillas]);

  // Load editing factura — auto-select plantilla
  useEffect(() => {
    if (!editingId || !token || !plantillas.length) return;
    (async () => {
      try {
        // Get factura metadata (includes plantilla_nombre)
        const rh = await apiFetch(`${API_URL}/historial`, { headers: authHeaders(token) });
        const historial = await rh.json();
        const facturaMeta = historial.find(f => f.id === editingId);

        // Get factura data
        const r = await apiFetch(`${API_URL}/factura/${editingId}`, { headers: authHeaders(token) });
        if (!r.ok) return;
        const data = await r.json();
        let datos = data;
        if (data.datos_json_cifrado) {
          const { descifrar } = await import('../utils/crypto');
          const raw = await descifrar(data.datos_json_cifrado);
          datos = JSON.parse(raw);
        }
        if (!datos.numero_factura && !datos.lineas) {
          toast('Formato de factura legacy — solo se puede descargar', 'info');
          return;
        }

        // Fill form data
        setForm({
          numero_factura: datos.numero_factura || '',
          fecha: datos.fecha || '',
          referencia: datos.referencia || '',
          notas: datos.notas || '',
        });
        setCliente(datos.cliente || { nombre: '', cif: '', direccion: '', email: '', telefono: '' });
        setLineas(datos.lineas?.length ? datos.lineas : [{}]);

        // Auto-select plantilla by name match or first available
        const pNombre = facturaMeta?.plantilla_nombre || facturaMeta?.barco || '';
        const match = plantillas.find(p => p.nombre === pNombre) || plantillas[0];
        if (match) {
          await seleccionar(match);
          toast('Factura cargada para editar', 'success');
        }
      } catch { toast('Error cargando factura', 'error'); }
    })();
  }, [editingId, token, plantillas]);

  const seleccionar = async (p) => {
    setSelectedId(p.id);
    setNombre(`${p.nombre} (${p.tipo})`);
    try {
      const r = await apiFetch(`${API_URL}/plantillas/${p.id}`, { headers: authHeaders(token) });
      if (r.ok) {
        const data = await r.json();
        setConfig(JSON.parse(data.config_json || '{}'));
      }
    } catch { setConfig(null); }
    setStep('form');
  };

  const cols = config?.columnas || COL_PRESETS.simple;
  const visCols = cols.filter(c => !c.oculta);
  const showCli = config?.cliente?.mostrar !== false;

  const updateLinea = (idx, campo, valor) => {
    const nuevo = [...lineas];
    nuevo[idx] = { ...nuevo[idx], [campo]: valor };
    cols.filter(c => c.tipo === 'formula' && c.formula).forEach(c => {
      nuevo[idx][c.campo] = evalFormulaClient(c.formula, nuevo[idx]);
    });
    setLineas(nuevo);
  };

  const addLinea = () => setLineas([...lineas, {}]);
  const removeLinea = (idx) => setLineas(lineas.filter((_, i) => i !== idx));

  const recogerDatos = () => {
    const data = { ...form, cliente, lineas: lineas.filter(l => Object.values(l).some(v => v)) };
    if (!data.numero_factura) { toast('Indica el nº de factura', 'warn'); return null; }
    if (!data.lineas.length) { toast('Añade al menos una línea', 'warn'); return null; }
    return data;
  };

  const guardar = async () => {
    if (!selectedId) { toast('Selecciona plantilla', 'warn'); return; }
    const data = recogerDatos();
    if (!data) return;
    try {
      if (editingId) await apiFetch(`${API_URL}/eliminar-factura/${editingId}`, { method: 'DELETE', headers: authHeaders(token) });
      const r = await apiFetch(`${API_URL}/guardar-con-plantilla?plantilla_id=${selectedId}`, {
        method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data)
      });
      if (r.ok) { toast(editingId ? 'Factura actualizada' : 'Guardada en la nube', 'success'); if (onClearEdit) onClearEdit(); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error de conexión', 'error'); }
  };

  const descargar = async (formato) => {
    if (!selectedId) { toast('Selecciona plantilla', 'warn'); return; }
    const data = recogerDatos();
    if (!data) return;
    setDownloading(true);
    try {
      const r = await apiFetch(`${API_URL}/generar-con-plantilla?formato=${formato}&plantilla_id=${selectedId}`, {
        method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data)
      });
      if (r.ok) {
        descargarBlob(await r.blob(), r.headers.get('Content-Disposition'), `Factura_${data.numero_factura}`, formato);
        setShowDownload(false);
        toast('Archivo descargado', 'success');
      } else {
        const err = await r.json().catch(() => ({}));
        toast(err.detail || 'Error generando', 'error');
      }
    } catch { toast('Error de conexión', 'error'); }
    setDownloading(false);
  };

  // STEP 1: Selector
  if (step === 'selector') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="mb-8 pb-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-2xl">note_add</span> Nueva Factura
        </h2>
      </header>
      <p className="text-slate-500 text-sm mb-4">Selecciona una plantilla para crear tu factura:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
        {plantillas.map(p => (
          <button key={p.id} onClick={() => seleccionar(p)}
            className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm hover:border-primary hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${p.tipo === 'visual' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.tipo}</span>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">chevron_right</span>
            </div>
            <h3 className="font-bold text-slate-900 text-lg">{p.nombre}</h3>
            <p className="text-xs text-slate-400 mt-1">{new Date(p.created_at).toLocaleDateString('es-ES')}</p>
          </button>
        ))}
      </div>
      {!plantillas.length && (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">add_circle</span>
          <p className="text-slate-500 font-medium mb-3">Crea tu primera plantilla para empezar</p>
        </div>
      )}
    </div>
  );

  // STEP 2: Form
  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <DownloadModal open={showDownload} onClose={() => { setShowDownload(false); setDownloading(false); }}
        onSelect={descargar} loading={downloading} />

      <header className="mb-6 pb-6 border-b border-slate-200 flex items-center gap-4">
        <button onClick={() => { setStep('selector'); setSelectedId(null); setConfig(null); if (onClearEdit) onClearEdit(); }}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-2xl font-bold">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
      </header>

      <div className="bg-violet-50 border border-violet-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-violet-600">draft</span>
        <span className="text-sm font-semibold text-violet-700">{nombre}</span>
      </div>

      {/* Datos básicos */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-bold text-primary flex items-center gap-2 mb-6"><span className="material-symbols-outlined">info</span> Detalles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className="text-sm font-semibold text-slate-600 block mb-1">Nº Factura</label>
            <input type="text" value={form.numero_factura} onChange={e => setForm({...form, numero_factura: e.target.value})}
              className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 focus:ring-primary" placeholder="2026-0001" /></div>
          <div><label className="text-sm font-semibold text-slate-600 block mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})}
              className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 focus:ring-primary" /></div>
        </div>
        <div className="mt-4"><label className="text-sm font-semibold text-slate-600 block mb-1">Referencia</label>
          <input type="text" value={form.referencia} onChange={e => setForm({...form, referencia: e.target.value})}
            className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Proyecto Alpha" /></div>
      </div>

      {/* Cliente */}
      {showCli && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-bold text-primary flex items-center gap-2 mb-6"><span className="material-symbols-outlined">person</span> Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[['nombre','Nombre'],['cif','CIF'],['direccion','Dirección'],['email','Email'],['telefono','Teléfono']].map(([k,l]) => (
              <div key={k}><label className="text-sm font-semibold text-slate-600 block mb-1">{l}</label>
                <input type="text" value={cliente[k]||''} onChange={e => setCliente({...cliente, [k]: e.target.value})}
                  className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-2.5 text-sm" /></div>
            ))}
          </div>
        </div>
      )}

      {/* Líneas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-bold text-primary flex items-center gap-2 mb-4"><span className="material-symbols-outlined">list</span> Líneas</h3>
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 40px' }}>
          {visCols.map(c => <span key={c.campo} className="text-[10px] font-bold text-slate-400 uppercase px-1">{c.nombre}{c.tipo === 'formula' ? ' ƒx' : ''}</span>)}
          <span />
        </div>
        {lineas.map((linea, idx) => (
          <div key={idx} className="grid gap-2 mb-2" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 40px' }}>
            {visCols.map(c => (
              <input key={c.campo} type="text"
                value={linea[c.campo] || ''}
                readOnly={c.tipo === 'formula'}
                onChange={e => updateLinea(idx, c.campo, e.target.value)}
                className={`rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm ${c.tipo === 'formula' ? 'bg-violet-50 text-violet-700 font-mono' : ''}`}
                placeholder={c.tipo === 'formula' ? 'auto' : c.nombre} />
            ))}
            <button onClick={() => removeLinea(idx)} className="text-slate-300 hover:text-red-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        ))}
        <button onClick={addLinea} className="mt-2 w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">add</span> Añadir línea
        </button>
      </div>

      {/* Notas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Notas</h3>
        <textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
          className="w-full rounded-lg border-slate-200 bg-slate-50 p-4 min-h-[80px] text-sm" placeholder="Condiciones de pago..." />
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-4">
        <button onClick={guardar} className="flex-1 flex items-center justify-center gap-2 px-8 py-3.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 shadow-lg transition-all">
          <span className="material-symbols-outlined">cloud_upload</span> GUARDAR EN NUBE
        </button>
        <button onClick={() => setShowDownload(true)} className="flex-1 flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 transition-all">
          <span className="material-symbols-outlined">download</span> DESCARGAR
        </button>
      </div>
    </div>
  );
}