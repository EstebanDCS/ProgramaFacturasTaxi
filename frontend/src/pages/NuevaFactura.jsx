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
  const [tickets, setTickets] = useState([]);
  const [step, setStep] = useState('selector');
  const [showDownload, setShowDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cargarPlantillas = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_URL}/plantillas`, { headers: authHeaders(token) });
      return await r.json();
    } catch { return []; }
  }, [token]);

  useEffect(() => { if (token) cargarPlantillas().then(setPlantillas); }, [token, cargarPlantillas]);

  // Load editing factura
  useEffect(() => {
    if (!editingId || !token || !plantillas.length) return;
    (async () => {
      try {
        const rh = await apiFetch(`${API_URL}/historial`, { headers: authHeaders(token) });
        const historial = await rh.json();
        const meta = historial.find(f => f.id === editingId);
        const r = await apiFetch(`${API_URL}/factura/${editingId}`, { headers: authHeaders(token) });
        if (!r.ok) return;
        const data = await r.json();
        let datos = data;
        if (data.datos_json_cifrado) {
          const { descifrar } = await import('../utils/crypto');
          datos = JSON.parse(await descifrar(data.datos_json_cifrado));
        }
        if (!datos.numero_factura && !datos.lineas) { toast('Formato legacy', 'info'); return; }
        setForm({ numero_factura: datos.numero_factura || '', fecha: datos.fecha || '', referencia: datos.referencia || '', notas: datos.notas || '' });
        setCliente(datos.cliente || {});
        setLineas(datos.lineas?.length ? datos.lineas : [{}]);
        if (datos.tickets?.length) setTickets(datos.tickets);
        const match = plantillas.find(p => p.nombre === (meta?.plantilla_nombre || meta?.barco)) || plantillas[0];
        if (match) { await seleccionar(match); toast('Factura cargada', 'success'); }
      } catch { toast('Error cargando', 'error'); }
    })();
  }, [editingId, token, plantillas]);

  const seleccionar = async (p) => {
    setSelectedId(p.id);
    setNombre(`${p.nombre} (${p.tipo})`);
    try {
      const r = await apiFetch(`${API_URL}/plantillas/${p.id}`, { headers: authHeaders(token) });
      if (r.ok) { const data = await r.json(); setConfig(JSON.parse(data.config_json || '{}')); }
    } catch { setConfig(null); }
    setStep('form');
  };

  // Derived from config
  const cols = config?.columnas || COL_PRESETS.simple;
  const visCols = cols.filter(c => !c.oculta);
  const showCli = config?.cliente?.mostrar !== false;
  const ticketCfg = config?.hoja_detalle;
  const hasTickets = ticketCfg?.activar && ticketCfg?.campos?.length;

  const updateLinea = (idx, campo, valor) => {
    const n = [...lineas]; n[idx] = { ...n[idx], [campo]: valor };
    cols.filter(c => c.tipo === 'formula' && c.formula).forEach(c => { n[idx][c.campo] = evalFormulaClient(c.formula, n[idx]); });
    setLineas(n);
  };

  const addTicket = () => {
    const empty = {};
    (ticketCfg?.campos || []).forEach(c => { empty[c.campo] = ''; });
    setTickets([...tickets, empty]);
  };
  const removeTicket = (idx) => setTickets(tickets.filter((_, i) => i !== idx));
  const updateTicket = (idx, campo, valor) => {
    const n = [...tickets]; n[idx] = { ...n[idx], [campo]: valor }; setTickets(n);
  };

  const recogerDatos = () => {
    const data = {
      ...form, cliente,
      lineas: lineas.filter(l => Object.values(l).some(v => v)),
      tickets: hasTickets ? tickets.filter(t => Object.values(t).some(v => v)) : [],
    };
    if (!data.numero_factura) { toast('Nº factura requerido', 'warn'); return null; }
    if (!data.lineas.length && !data.tickets.length) { toast('Añade datos', 'warn'); return null; }
    return data;
  };

  const guardar = async () => {
    if (!selectedId) return;
    const data = recogerDatos(); if (!data) return;
    try {
      if (editingId) await apiFetch(`${API_URL}/eliminar-factura/${editingId}`, { method: 'DELETE', headers: authHeaders(token) });
      const r = await apiFetch(`${API_URL}/guardar-con-plantilla?plantilla_id=${selectedId}`, {
        method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data) });
      if (r.ok) { toast(editingId ? 'Actualizada' : 'Guardada', 'success'); if (onClearEdit) onClearEdit(); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error de conexión', 'error'); }
  };

  const descargar = async (formato) => {
    if (!selectedId) return;
    const data = recogerDatos(); if (!data) return;
    setDownloading(true);
    try {
      const r = await apiFetch(`${API_URL}/generar-con-plantilla?formato=${formato}&plantilla_id=${selectedId}`, {
        method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data) });
      if (r.ok) { descargarBlob(await r.blob(), r.headers.get('Content-Disposition'), `Factura_${data.numero_factura}`, formato); setShowDownload(false); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error', 'error'); }
    setDownloading(false);
  };

  // ── SELECTOR ──
  if (step === 'selector') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="mb-8 pb-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-2xl">note_add</span> Nueva Factura
        </h2>
      </header>
      <p className="text-slate-500 text-sm mb-4">Selecciona una plantilla:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
        {plantillas.map(p => (
          <button key={p.id} onClick={() => seleccionar(p)}
            className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm hover:border-primary hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.tipo === 'visual' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.tipo}</span>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-primary">chevron_right</span>
            </div>
            <h3 className="font-bold text-slate-900 text-lg">{p.nombre}</h3>
            <p className="text-xs text-slate-400 mt-1">{new Date(p.created_at).toLocaleDateString('es-ES')}</p>
          </button>
        ))}
      </div>
      {!plantillas.length && (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">add_circle</span>
          <p className="text-slate-500 font-medium">Crea una plantilla primero</p>
        </div>
      )}
    </div>
  );

  // ── FORM ──
  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <DownloadModal open={showDownload} onClose={() => { setShowDownload(false); setDownloading(false); }} onSelect={descargar} loading={downloading} />

      <header className="mb-6 pb-6 border-b border-slate-200 flex items-center gap-4">
        <button onClick={() => { setStep('selector'); setSelectedId(null); setConfig(null); if (onClearEdit) onClearEdit(); }}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-2xl font-bold">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
      </header>

      <div className="bg-violet-50 border border-violet-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-violet-600">draft</span>
        <span className="text-sm font-semibold text-violet-700">{nombre}</span>
      </div>

      {/* ── Datos básicos ── */}
      <Section icon="info" title="Detalles de factura">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Nº Factura" value={form.numero_factura} onChange={v => setForm({...form, numero_factura: v})} placeholder="2026-0001" />
          <div><label className="text-sm font-semibold text-slate-600 block mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})}
              className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 focus:ring-primary" /></div>
        </div>
        <Field label="Referencia" value={form.referencia} onChange={v => setForm({...form, referencia: v})} placeholder="Proyecto Alpha" className="mt-4" />
      </Section>

      {/* ── Cliente ── */}
      {showCli && (
        <Section icon="person" title="Cliente">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[['nombre','Nombre'],['cif','CIF'],['direccion','Dirección'],['email','Email'],['telefono','Teléfono']].map(([k,l]) => (
              <Field key={k} label={l} value={cliente[k]||''} onChange={v => setCliente({...cliente, [k]: v})} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Líneas (tabla de items) ── */}
      <Section icon="list" title="Líneas de factura">
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 36px' }}>
          {visCols.map(c => <span key={c.campo} className="text-[10px] font-bold text-slate-400 uppercase px-1">{c.nombre}{c.tipo === 'formula' ? ' ƒx' : ''}</span>)}
          <span />
        </div>
        {lineas.map((linea, idx) => (
          <div key={idx} className="grid gap-2 mb-2" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 36px' }}>
            {visCols.map(c => (
              <input key={c.campo} type="text" value={linea[c.campo] || ''} readOnly={c.tipo === 'formula'}
                onChange={e => updateLinea(idx, c.campo, e.target.value)}
                className={`rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm ${c.tipo === 'formula' ? 'bg-violet-50 text-violet-700 font-mono' : ''}`}
                placeholder={c.tipo === 'formula' ? 'auto' : c.nombre} />
            ))}
            <button onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">close</span></button>
          </div>
        ))}
        <button onClick={() => setLineas([...lineas, {}])} className="mt-2 w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">add</span> Añadir línea
        </button>
      </Section>

      {/* ── Tickets / Sub-items ── */}
      {hasTickets && (
        <Section icon="auto_awesome" title={`${ticketCfg.titulo || 'Tickets'} (${tickets.length})`} color="violet">
          {tickets.map((ticket, ti) => (
            <div key={ti} className="bg-violet-50/50 border border-violet-100 rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-violet-700">{ticketCfg.titulo} #{ti + 1}</span>
                <button onClick={() => removeTicket(ti)} className="text-violet-300 hover:text-red-500 transition-colors">
                  <span className="material-symbols-outlined text-base">close</span></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(ticketCfg.campos || []).map(campo => (
                  <div key={campo.campo}>
                    <label className="text-xs font-semibold text-violet-600 block mb-1">{campo.nombre}</label>
                    {campo.tipo === 'checkbox' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!ticket[campo.campo]} onChange={e => updateTicket(ti, campo.campo, e.target.checked)}
                          className="rounded text-violet-600" /> {campo.nombre}
                      </label>
                    ) : campo.tipo === 'dropdown' ? (
                      <select value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)}
                        className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm focus:ring-violet-400">
                        <option value="">Seleccionar...</option>
                        {(campo.opciones || []).map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                    ) : campo.tipo === 'fecha' ? (
                      <input type="date" value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)}
                        className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm focus:ring-violet-400" />
                    ) : (
                      <input type={campo.tipo === 'numero' || campo.tipo === 'moneda' ? 'number' : 'text'}
                        value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)}
                        step={campo.tipo === 'moneda' ? '0.01' : undefined}
                        className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm focus:ring-violet-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addTicket} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-200 rounded-lg text-sm font-bold text-violet-400 hover:border-violet-400 hover:text-violet-600 transition-colors">
            <span className="material-symbols-outlined">add_circle</span> Añadir {ticketCfg.titulo || 'ticket'}
          </button>
        </Section>
      )}

      {/* ── Notas ── */}
      <Section icon="sticky_note_2" title="Notas">
        <textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
          className="w-full rounded-lg border-slate-200 bg-slate-50 p-4 min-h-[80px] text-sm" placeholder="Condiciones de pago..." />
      </Section>

      {/* ── Actions ── */}
      <div className="flex flex-col md:flex-row gap-4 mt-2">
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


function Section({ icon, title, children, color = 'primary' }) {
  const colors = { primary: 'text-primary', violet: 'text-violet-600', amber: 'text-amber-600' };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-5">
      <h3 className={`text-lg font-bold ${colors[color] || colors.primary} flex items-center gap-2 mb-5`}>
        <span className="material-symbols-outlined">{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, className = '', ...props }) {
  return (
    <div className={className}>
      <label className="text-sm font-semibold text-slate-600 block mb-1">{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:ring-primary" {...props} />
    </div>
  );
}