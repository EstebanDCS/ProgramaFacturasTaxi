import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL, COL_PRESETS } from '../config';
import { evalFormulaClient, computeLineas, calcSubtotal, calcTotales, calcTicketsSummary, buildFormulaContext, evalWithContext, resolveVariable, fmt, descargarBlob } from '../utils/helpers';
import DownloadModal from '../components/DownloadModal';

export default function NuevaFactura({ editingId, onClearEdit }) {
  const { token } = useAuth();
  const toast = useToast();
  const [plantillas, setPlantillas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig] = useState(null);
  const [nombre, setNombre] = useState('');
  const [formData, setFormData] = useState({});
  const [lineas, setLineas] = useState([{}]);
  const [tickets, setTickets] = useState([]);
  const [step, setStep] = useState('selector');
  const [showDownload, setShowDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cargarPlantillas = useCallback(async () => {
    try { const r = await apiFetch(`${API_URL}/plantillas`, { headers: authHeaders(token) }); return await r.json(); } catch { return []; }
  }, [token]);

  useEffect(() => { if (token) cargarPlantillas().then(setPlantillas); }, [token, cargarPlantillas]);

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
        if (data.datos_json_cifrado) { const { descifrar } = await import('../utils/crypto'); datos = JSON.parse(await descifrar(data.datos_json_cifrado)); }
        setFormData(datos);
        if (datos.lineas?.length) setLineas(datos.lineas);
        if (datos.tickets?.length) setTickets(datos.tickets);
        const match = plantillas.find(p => p.nombre === (meta?.plantilla_nombre || meta?.barco)) || plantillas[0];
        if (match) { await seleccionar(match); toast('Factura cargada', 'success'); }
      } catch { toast('Error cargando', 'error'); }
    })();
  }, [editingId, token, plantillas]);

  const seleccionar = async (p) => {
    setSelectedId(p.id); setNombre(`${p.nombre} (${p.tipo})`);
    try { const r = await apiFetch(`${API_URL}/plantillas/${p.id}`, { headers: authHeaders(token) }); if (r.ok) { const data = await r.json(); setConfig(JSON.parse(data.config_json || '{}')); } } catch { setConfig(null); }
    setStep('form');
  };

  // Derive structure from config
  const mainBloques = config?.bloques || [];
  const ticketCfg = config?.hoja_detalle;
  const hasTickets = ticketCfg?.activar && ticketCfg?.campos?.length;
  const cols = config?.columnas || COL_PRESETS?.simple || [];
  const visCols = cols.filter(c => !c.oculta);
  const impuestos = config?.impuestos || [{ nombre: 'IVA', porcentaje: 21 }];
  const moneda = config?.moneda || '€';

  // Auto-calculate
  const computedLineas = useMemo(() => computeLineas(lineas, cols), [lineas, cols]);
  const subtotalLineas = useMemo(() => calcSubtotal(computedLineas, cols), [computedLineas, cols]);
  const { ctx: formulaCtx } = useMemo(
    () => buildFormulaContext(subtotalLineas, tickets, ticketCfg?.campos, computedLineas, cols),
    [subtotalLineas, tickets, ticketCfg?.campos, computedLineas, cols]
  );
  const totalesLineas = useMemo(() => calcTotales(subtotalLineas, impuestos, formulaCtx), [subtotalLineas, impuestos, formulaCtx]);
  const ticketSummary = useMemo(() => calcTicketsSummary(tickets, ticketCfg?.campos), [tickets, ticketCfg?.campos]);
  const ticketTotal = useMemo(() => Object.values(ticketSummary.sumas).reduce((s, v) => s + v.total, 0), [ticketSummary]);
  const grandTotal = totalesLineas.total + ticketTotal;

  // Auto-fill: resolve formulas in main block configs
  const autoFilledData = useMemo(() => {
    const filled = { ...formData };
    mainBloques.forEach(b => {
      const autoFill = b.config?.autoFill;
      const campo = b.config?.campo;
      if (autoFill && campo && !formData[`_manual_${campo}`]) {
        const resolved = resolveVariable(autoFill, formulaCtx);
        if (resolved !== '' && resolved !== autoFill) {
          // Format number results for currency fields
          if (b.type === 'currency_field' && typeof resolved === 'number') {
            filled[campo] = resolved.toFixed(2);
          } else {
            filled[campo] = resolved;
          }
        }
      }
    });
    return filled;
  }, [formData, mainBloques, formulaCtx]);

  const updateField = (campo, valor) => setFormData(prev => ({ ...prev, [campo]: valor, [`_manual_${campo}`]: true }));
  const clearManual = (campo) => setFormData(prev => { const n = { ...prev }; delete n[`_manual_${campo}`]; delete n[campo]; return n; });
  const updateLinea = (idx, campo, valor) => {
    const n = [...lineas]; n[idx] = { ...n[idx], [campo]: valor };
    cols.filter(c => c.tipo === 'formula' && c.formula).forEach(c => { n[idx][c.campo] = evalFormulaClient(c.formula, n[idx]); });
    setLineas(n);
  };
  const addTicket = () => { const empty = {}; (ticketCfg?.campos || []).forEach(c => { empty[c.campo] = ''; }); setTickets([...tickets, empty]); };
  const removeTicket = (idx) => setTickets(tickets.filter((_, i) => i !== idx));
  const updateTicket = (idx, campo, valor) => { const n = [...tickets]; n[idx] = { ...n[idx], [campo]: valor }; setTickets(n); };

  const recogerDatos = () => {
    const data = {
      ...autoFilledData,
      numero_factura: autoFilledData.numero_factura || formData.numero_factura || '',
      lineas: computedLineas.filter(l => Object.values(l).some(v => v)),
      tickets: hasTickets ? tickets.filter(t => Object.values(t).some(v => v)) : [],
      totales: { subtotal: totalesLineas.subtotal, impuestos: totalesLineas.taxes, total: grandTotal },
    };
    // Clean internal keys
    Object.keys(data).filter(k => k.startsWith('_manual_')).forEach(k => delete data[k]);
    if (!data.numero_factura) { toast('Nº factura requerido', 'warn'); return null; }
    return data;
  };

  const guardar = async () => {
    if (!selectedId) return; const data = recogerDatos(); if (!data) return;
    try {
      if (editingId) await apiFetch(`${API_URL}/eliminar-factura/${editingId}`, { method: 'DELETE', headers: authHeaders(token) });
      const r = await apiFetch(`${API_URL}/guardar-con-plantilla?plantilla_id=${selectedId}`, { method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data) });
      if (r.ok) { toast(editingId ? 'Actualizada' : 'Guardada', 'success'); if (onClearEdit) onClearEdit(); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error de conexión', 'error'); }
  };

  const descargar = async (formato) => {
    if (!selectedId) return; const data = recogerDatos(); if (!data) return;
    setDownloading(true);
    try {
      const r = await apiFetch(`${API_URL}/generar-con-plantilla?formato=${formato}&plantilla_id=${selectedId}`, { method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(data) });
      if (r.ok) { descargarBlob(await r.blob(), r.headers.get('Content-Disposition'), `Factura_${data.numero_factura}`, formato); setShowDownload(false); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error', 'error'); }
    setDownloading(false);
  };

  // ── SELECTOR ──
  if (step === 'selector') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="mb-8 pb-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3"><span className="material-symbols-outlined text-primary text-2xl">note_add</span> Nueva Factura</h2>
      </header>
      <p className="text-slate-500 text-sm mb-4">Selecciona una plantilla:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plantillas.map(p => (
          <button key={p.id} onClick={() => seleccionar(p)} className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm hover:border-primary hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.tipo === 'visual' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.tipo}</span>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-primary">chevron_right</span>
            </div>
            <h3 className="font-bold text-slate-900 text-lg">{p.nombre}</h3>
          </button>
        ))}
      </div>
      {!plantillas.length && <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl"><span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">add_circle</span><p className="text-slate-500">Crea una plantilla primero</p></div>}
    </div>
  );

  // ── FORM: dynamic from config.bloques ──
  // Determine which fields to show. If no bloques, show legacy hardcoded form.
  const hasCustomBloques = mainBloques.length > 0;

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <DownloadModal open={showDownload} onClose={() => { setShowDownload(false); setDownloading(false); }} onSelect={descargar} loading={downloading} />

      <header className="mb-6 pb-6 border-b border-slate-200 flex items-center gap-4">
        <button onClick={() => { setStep('selector'); setSelectedId(null); setConfig(null); if (onClearEdit) onClearEdit(); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-2xl font-bold">{editingId ? 'Editar Factura' : 'Nueva Factura'}</h2>
      </header>

      <div className="bg-violet-50 border border-violet-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-violet-600">draft</span>
        <span className="text-sm font-semibold text-violet-700">{nombre}</span>
      </div>

      {/* ── Dynamic fields from config.bloques ── */}
      {hasCustomBloques && (
        <Section icon="description" title="Datos de factura">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mainBloques.filter(b => ['text_field','number_field','currency_field','date_field','dropdown','checkbox'].includes(b.type)).map((b, i) => {
              const campo = b.config?.campo;
              const hasAuto = b.config?.autoFill && !formData[`_manual_${campo}`];
              const displayVal = hasAuto ? autoFilledData[campo] : (formData[campo] ?? '');
              return (
                <DynField key={i} block={b} value={displayVal}
                  onChange={v => updateField(campo, v)}
                  isAuto={hasAuto}
                  onClearManual={() => clearManual(campo)} />
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Legacy: hardcoded fields if no bloques ── */}
      {!hasCustomBloques && (
        <>
          <Section icon="info" title="Detalles">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Nº Factura" value={formData.numero_factura} onChange={v => updateField('numero_factura', v)} placeholder="2026-0001" />
              <div><label className="text-sm font-semibold text-slate-600 block mb-1">Fecha</label>
                <input type="date" value={formData.fecha || ''} onChange={e => updateField('fecha', e.target.value)} className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 focus:ring-primary" /></div>
            </div>
          </Section>
          {config?.cliente?.mostrar !== false && (
            <Section icon="person" title="Cliente">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[['nombre','Nombre'],['cif','CIF'],['direccion','Dirección'],['email','Email'],['telefono','Teléfono']].map(([k,l]) => (
                  <Field key={k} label={l} value={(formData.cliente||{})[k]||''} onChange={v => setFormData(prev => ({...prev, cliente: {...(prev.cliente||{}), [k]: v}}))} />
                ))}
              </div>
            </Section>
          )}
          {/* Lines */}
          <Section icon="list" title="Líneas">
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 36px' }}>
              {visCols.map(c => <span key={c.campo} className="text-[10px] font-bold text-slate-400 uppercase px-1">{c.nombre}</span>)}
              <span />
            </div>
            {lineas.map((linea, idx) => (
              <div key={idx} className="grid gap-2 mb-2" style={{ gridTemplateColumns: visCols.map(c => c.tipo === 'texto' ? '2fr' : '1fr').join(' ') + ' 36px' }}>
                {visCols.map(c => (
                  <input key={c.campo} type="text" value={computedLineas[idx]?.[c.campo] || linea[c.campo] || ''} readOnly={c.tipo === 'formula'}
                    onChange={e => updateLinea(idx, c.campo, e.target.value)}
                    className={`rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm ${c.tipo === 'formula' ? 'bg-violet-50 text-violet-700 font-mono font-bold' : ''}`}
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
        </>
      )}

      {/* ── Live totals ── */}
      {(subtotalLineas > 0 || !hasCustomBloques) && (
        <Section icon="functions" title="Totales">
          <div className="flex flex-col items-end gap-1">
            {config?.mostrar_desglose !== false && <>
              <div className="flex items-center gap-6 text-sm"><span className="text-slate-400">Subtotal</span><span className="font-bold text-slate-700 w-28 text-right">{fmt(totalesLineas.subtotal, moneda)}</span></div>
              {totalesLineas.taxes.map((t, i) => (
                <div key={i} className="flex items-center gap-6 text-sm"><span className="text-slate-400">{t.nombre} ({t.porcentaje}%)</span><span className="font-bold text-slate-700 w-28 text-right">{fmt(t.monto, moneda)}</span></div>
              ))}
            </>}
            <div className="flex items-center gap-6 text-base pt-2 mt-1 border-t-2 border-slate-800">
              <span className="font-black text-slate-800">TOTAL</span>
              <span className="font-black text-slate-900 w-28 text-right">{fmt(totalesLineas.total, moneda)}</span>
            </div>
          </div>
        </Section>
      )}

      {/* ── Tickets ── */}
      {hasTickets && (
        <Section icon="auto_awesome" title={`${ticketCfg.titulo || 'Tickets'} (${tickets.length})`} color="violet">
          {tickets.map((ticket, ti) => (
            <div key={ti} className="bg-violet-50/50 border border-violet-100 rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-violet-700">{ticketCfg.titulo} #{ti + 1}</span>
                <button onClick={() => removeTicket(ti)} className="text-violet-300 hover:text-red-500"><span className="material-symbols-outlined text-base">close</span></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(ticketCfg.campos || []).map(campo => (
                  <div key={campo.campo} className={campo.tipo === 'checkbox_group' ? 'md:col-span-2' : ''}>
                    <label className="text-xs font-semibold text-violet-600 block mb-1">{campo.nombre}</label>
                    {campo.tipo === 'checkbox_group' ? (
                      <div className="bg-white border border-violet-100 rounded-lg p-3">
                        <div className="flex flex-wrap gap-3">
                          {(campo.opciones || []).map(op => (
                            <div key={op.id} className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input type="checkbox" checked={!!ticket[op.id]} onChange={e => updateTicket(ti, op.id, e.target.checked)} className="rounded text-violet-600" />
                                <span>{op.nombre}</span>
                              </label>
                              {op.texto_campo && ticket[op.id] && (
                                <input type="text" value={ticket[op.texto_campo] || ''} onChange={e => updateTicket(ti, op.texto_campo, e.target.value)}
                                  placeholder="Especificar..." className="rounded-md border-violet-200 bg-violet-50 px-2 py-1 text-xs w-32" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : campo.tipo === 'checkbox' ? (
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!ticket[campo.campo]} onChange={e => updateTicket(ti, campo.campo, e.target.checked)} className="rounded text-violet-600" /> {campo.nombre}</label>
                    ) : campo.tipo === 'dropdown' ? (
                      <select value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)} className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm">
                        <option value="">Seleccionar...</option>
                        {(campo.opciones || []).map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                    ) : campo.tipo === 'fecha' ? (
                      <input type="date" value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)} className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm" />
                    ) : (
                      <input type={campo.tipo === 'numero' || campo.tipo === 'moneda' ? 'number' : 'text'}
                        value={ticket[campo.campo] || ''} onChange={e => updateTicket(ti, campo.campo, e.target.value)}
                        step={campo.tipo === 'moneda' ? '0.01' : undefined}
                        className="w-full rounded-lg border-violet-200 bg-white px-3 py-2 text-sm" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addTicket} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-200 rounded-lg text-sm font-bold text-violet-400 hover:border-violet-400 hover:text-violet-600 transition-colors">
            <span className="material-symbols-outlined">add_circle</span> Añadir {ticketCfg.titulo || 'ticket'}
          </button>
          {ticketSummary.count > 0 && Object.keys(ticketSummary.sumas).length > 0 && (
            <div className="mt-4 pt-4 border-t border-violet-200">
              <div className="flex flex-col items-end gap-1">
                {Object.values(ticketSummary.sumas).map(s => (
                  <div key={s.nombre} className="flex items-center gap-6 text-sm"><span className="text-violet-400">Total {s.nombre}</span><span className="font-bold text-violet-700 w-28 text-right">{fmt(s.total, moneda)}</span></div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Notas */}
      {!hasCustomBloques && (
        <Section icon="sticky_note_2" title="Notas">
          <textarea value={formData.notas || ''} onChange={e => updateField('notas', e.target.value)} className="w-full rounded-lg border-slate-200 bg-slate-50 p-4 min-h-[80px] text-sm" placeholder="Condiciones de pago..." />
        </Section>
      )}

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-4 mt-6">
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

// Dynamic field renderer based on block type
function DynField({ block, value, onChange, isAuto, onClearManual }) {
  const cfg = block.config || {};
  const label = cfg.label || cfg.campo || 'Campo';
  const autoClass = isAuto ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-slate-50';
  const autoLabel = isAuto ? (
    <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold">auto</span>
  ) : null;
  const manualBtn = !isAuto && cfg.autoFill ? (
    <button onClick={onClearManual} className="ml-1 text-[9px] text-violet-400 hover:text-violet-600" title="Volver a auto-rellenar">↺</button>
  ) : null;

  switch (block.type) {
    case 'date_field':
      return (<div><label className="text-sm font-semibold text-slate-600 flex items-center mb-1">{label}{autoLabel}{manualBtn}</label>
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className={`w-full rounded-lg ${autoClass} px-4 py-3 text-sm focus:ring-primary`} /></div>);
    case 'currency_field':
      return (<div><label className="text-sm font-semibold text-slate-600 flex items-center mb-1">{label}{autoLabel}{manualBtn}</label>
        <input type="number" step="0.01" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="0.00" className={`w-full rounded-lg ${autoClass} px-4 py-3 text-sm focus:ring-primary`} /></div>);
    case 'number_field':
      return (<div><label className="text-sm font-semibold text-slate-600 flex items-center mb-1">{label}{autoLabel}{manualBtn}</label>
        <input type="number" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="0" className={`w-full rounded-lg ${autoClass} px-4 py-3 text-sm focus:ring-primary`} /></div>);
    case 'checkbox':
      return (<div className="flex items-center"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="rounded text-primary" />{label}</label></div>);
    case 'dropdown':
      return (<div><label className="text-sm font-semibold text-slate-600 flex items-center mb-1">{label}</label>
        <select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <option value="">Seleccionar...</option>{(cfg.opciones || []).map(op => <option key={op} value={op}>{op}</option>)}</select></div>);
    default:
      return (<div><label className="text-sm font-semibold text-slate-600 flex items-center mb-1">{label}{autoLabel}{manualBtn}</label>
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className={`w-full rounded-lg ${autoClass} px-4 py-3 text-sm focus:ring-primary`} /></div>);
  }
}

function Section({ icon, title, children, color = 'primary' }) {
  const c = { primary: 'text-primary', violet: 'text-violet-600', amber: 'text-amber-600' };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-5">
      <h3 className={`text-lg font-bold ${c[color] || c.primary} flex items-center gap-2 mb-5`}><span className="material-symbols-outlined">{icon}</span> {title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, className = '', ...props }) {
  return (
    <div className={className}><label className="text-sm font-semibold text-slate-600 block mb-1">{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:ring-primary" {...props} />
    </div>
  );
}