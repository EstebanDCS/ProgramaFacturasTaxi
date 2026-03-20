import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL, COL_PRESETS } from '../config';
import { esc } from '../utils/helpers';

export default function CrearPlantilla({ editingId, onBack }) {
  const { token } = useAuth();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState({ nombre: '', cif: '', direccion: '', telefono: '', email: '', logo_url: '' });
  const [estilo, setEstilo] = useState({ color_primario: '#1a2e4a', color_secundario: '#0d6dfd', fuente: 'Helvetica, Arial, sans-serif', tam_fuente: 10 });
  const [pagina, setPagina] = useState({ size: 'A4', orientation: 'portrait', margenes: { top: 20, right: 15, bottom: 20, left: 15 }, escala: 100, interlineado: 1.5 });
  const [clienteMostrar, setClienteMostrar] = useState(true);
  const [columnas, setColumnas] = useState(COL_PRESETS.simple);
  const [impuestos, setImpuestos] = useState({ titulo: 'FACTURA', nombre: 'IVA', porcentaje: 21, moneda: '€', desglose: true });
  const [pie, setPie] = useState({ texto: '', mostrar_datos_pago: false, datos_pago: '' });
  const [detalle, setDetalle] = useState({ activar: false, titulo: 'Detalle' });
  const [tab, setTab] = useState('visual');

  // Load for editing
  useEffect(() => {
    if (!editingId || !token) return;
    (async () => {
      try {
        const r = await apiFetch(`${API_URL}/plantillas/${editingId}`, { headers: authHeaders(token) });
        if (!r.ok) return;
        const p = await r.json();
        if (p.tipo !== 'visual') { toast('Solo se pueden editar plantillas visuales', 'info'); return; }
        const cfg = JSON.parse(p.config_json || '{}');
        setNombre(p.nombre || '');
        if (cfg.empresa) setEmpresa(prev => ({ ...prev, ...cfg.empresa }));
        if (cfg.estilo) setEstilo(prev => ({ ...prev, ...cfg.estilo }));
        if (cfg.pagina) setPagina(prev => ({ ...prev, ...cfg.pagina, margenes: { ...prev.margenes, ...cfg.pagina?.margenes } }));
        setClienteMostrar(cfg.cliente?.mostrar !== false);
        if (cfg.columnas) setColumnas(cfg.columnas);
        if (cfg.impuestos?.[0]) setImpuestos(prev => ({ ...prev, nombre: cfg.impuestos[0].nombre, porcentaje: cfg.impuestos[0].porcentaje, titulo: cfg.titulo || 'FACTURA', moneda: cfg.moneda || '€', desglose: cfg.mostrar_desglose !== false }));
        if (cfg.pie) setPie(prev => ({ ...prev, ...cfg.pie }));
        if (cfg.hoja_detalle) setDetalle(prev => ({ ...prev, ...cfg.hoja_detalle }));
      } catch { toast('Error cargando plantilla', 'error'); }
    })();
  }, [editingId, token]);

  const buildConfig = () => ({
    empresa, estilo, pagina, cliente: { mostrar: clienteMostrar }, columnas,
    titulo: impuestos.titulo, moneda: impuestos.moneda, mostrar_desglose: impuestos.desglose,
    impuestos: [{ nombre: impuestos.nombre, porcentaje: impuestos.porcentaje }],
    pie, hoja_detalle: detalle,
  });

  const guardar = async () => {
    if (!nombre.trim()) { toast('Indica un nombre', 'warn'); return; }
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('config_json', JSON.stringify(buildConfig()));
    try {
      const url = editingId ? `${API_URL}/plantillas/${editingId}` : `${API_URL}/plantillas/crear-visual`;
      const method = editingId ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { toast(editingId ? 'Plantilla actualizada' : 'Plantilla guardada', 'success'); onBack(); }
      else toast('Error al guardar', 'error');
    } catch { toast('Error de conexión', 'error'); }
  };

  const cargarPreset = (key) => setColumnas([...COL_PRESETS[key]]);
  const addCol = () => setColumnas([...columnas, { nombre: '', campo: '', alineacion: 'left', tipo: 'texto', formula: '' }]);
  const removeCol = (idx) => setColumnas(columnas.filter((_, i) => i !== idx));
  const updateCol = (idx, field, val) => { const n = [...columnas]; n[idx] = { ...n[idx], [field]: val }; setColumnas(n); };

  const Input = ({ label, value, onChange, ...props }) => (
    <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" {...props} /></div>
  );

  return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-2xl font-bold">{editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}</h2>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('visual')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all ${tab === 'visual' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Crear Visual</button>
        <button onClick={() => setTab('excel')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all ${tab === 'excel' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Subir Excel</button>
      </div>

      {tab === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-4">
            {/* Nombre */}
            <Input label="Nombre de la plantilla" value={nombre} onChange={setNombre} placeholder="Ej: Factura servicios" />

            {/* Empresa */}
            <details open className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <summary className="px-5 py-4 cursor-pointer font-bold text-sm text-slate-700 flex items-center gap-2 hover:bg-slate-50">
                <span className="material-symbols-outlined text-base text-primary">business</span> Datos empresa
              </summary>
              <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-4">
                {[['nombre','Nombre'],['cif','CIF/NIF'],['direccion','Dirección'],['telefono','Teléfono'],['email','Email'],['logo_url','URL Logo']].map(([k,l]) => (
                  <Input key={k} label={l} value={empresa[k]} onChange={v => setEmpresa({...empresa, [k]: v})} />
                ))}
              </div>
            </details>

            {/* Estilo */}
            <details className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <summary className="px-5 py-4 cursor-pointer font-bold text-sm text-slate-700 flex items-center gap-2 hover:bg-slate-50">
                <span className="material-symbols-outlined text-base text-primary">palette</span> Estilo y página
              </summary>
              <div className="px-5 pb-5 pt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Color 1</label>
                  <input type="color" value={estilo.color_primario} onChange={e => setEstilo({...estilo, color_primario: e.target.value})} className="w-full h-10 rounded-lg border-slate-200 cursor-pointer" /></div>
                <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Color 2</label>
                  <input type="color" value={estilo.color_secundario} onChange={e => setEstilo({...estilo, color_secundario: e.target.value})} className="w-full h-10 rounded-lg border-slate-200 cursor-pointer" /></div>
                <Input label="Tamaño texto" type="number" value={estilo.tam_fuente} onChange={v => setEstilo({...estilo, tam_fuente: parseInt(v)||10})} />
                <Input label="Escala %" type="number" value={pagina.escala} onChange={v => setPagina({...pagina, escala: parseInt(v)||100})} />
              </div>
            </details>

            {/* Columnas */}
            <details open className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <summary className="px-5 py-4 cursor-pointer font-bold text-sm text-slate-700 flex items-center gap-2 hover:bg-slate-50">
                <span className="material-symbols-outlined text-base text-primary">view_column</span> Columnas
              </summary>
              <div className="px-5 pb-5 pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-slate-500">Preset:</span>
                  {['simple','detallado','servicios'].map(k => (
                    <button key={k} onClick={() => cargarPreset(k)} className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-primary/10 hover:text-primary transition-colors capitalize">{k}</button>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_1fr_70px_90px_1fr_28px] gap-2 mb-2 px-1">
                  {['Nombre','ID campo','Alinear','Tipo','Fórmula',''].map(h => <span key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</span>)}
                </div>
                {columnas.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_70px_90px_1fr_28px] gap-2 items-center mb-1.5">
                    <input value={c.nombre} onChange={e => updateCol(i,'nombre',e.target.value)} placeholder="Nombre" className="rounded-lg border-slate-200 bg-slate-50 px-2.5 py-2 text-xs" />
                    <input value={c.campo} onChange={e => updateCol(i,'campo',e.target.value)} placeholder="campo_id" className="rounded-lg border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-mono text-slate-500" />
                    <select value={c.alineacion} onChange={e => updateCol(i,'alineacion',e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-1 py-2 text-xs">
                      <option value="left">Izq</option><option value="center">Centro</option><option value="right">Der</option>
                    </select>
                    <select value={c.tipo} onChange={e => updateCol(i,'tipo',e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-1 py-2 text-xs">
                      <option value="texto">Texto</option><option value="numero">Número</option><option value="moneda">Moneda</option><option value="formula">Fórmula</option>
                    </select>
                    {c.tipo === 'formula' ? (
                      <input value={c.formula||''} onChange={e => updateCol(i,'formula',e.target.value)} placeholder="=cant*precio" className="rounded-lg border-violet-200 bg-violet-50 px-2.5 py-2 text-xs font-mono text-violet-700" />
                    ) : <span />}
                    <button onClick={() => removeCol(i)} className="text-slate-300 hover:text-red-500"><span className="material-symbols-outlined text-base">close</span></button>
                  </div>
                ))}
                <button onClick={addCol} className="mt-2 w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-sm">add</span> Añadir columna
                </button>
              </div>
            </details>

            {/* Impuestos */}
            <details className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <summary className="px-5 py-4 cursor-pointer font-bold text-sm text-slate-700 flex items-center gap-2 hover:bg-slate-50">
                <span className="material-symbols-outlined text-base text-primary">percent</span> Impuestos y moneda
              </summary>
              <div className="px-5 pb-5 pt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Título" value={impuestos.titulo} onChange={v => setImpuestos({...impuestos, titulo: v})} />
                <Input label="Impuesto" value={impuestos.nombre} onChange={v => setImpuestos({...impuestos, nombre: v})} />
                <Input label="%" type="number" value={impuestos.porcentaje} onChange={v => setImpuestos({...impuestos, porcentaje: parseFloat(v)||0})} />
                <Input label="Moneda" value={impuestos.moneda} onChange={v => setImpuestos({...impuestos, moneda: v})} />
              </div>
            </details>

            {/* Save */}
            <button onClick={guardar} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">save</span> {editingId ? 'Actualizar Plantilla' : 'Guardar Plantilla'}
            </button>
          </div>

          {/* Live Preview */}
          <div className="sticky top-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Vista previa</h3>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-[6px] leading-tight overflow-hidden" style={{ minHeight: 400 }}>
              <PreviewMini empresa={empresa} estilo={estilo} columnas={columnas} impuestos={impuestos} />
            </div>
          </div>
        </div>
      )}

      {tab === 'excel' && <ExcelUpload token={token} toast={toast} onBack={onBack} />}
    </div>
  );
}

function PreviewMini({ empresa, estilo, columnas, impuestos }) {
  const c1 = estilo.color_primario, c2 = estilo.color_secundario, mon = impuestos.moneda;
  const vis = columnas.filter(c => !c.oculta);
  return (
    <div style={{ fontFamily: 'sans-serif', color: '#333' }}>
      <table style={{ width: '100%', marginBottom: 3 }}><tbody><tr>
        <td><b style={{ color: c1 }}>{empresa.nombre || 'Empresa'}</b></td>
        <td style={{ textAlign: 'right', color: c2, fontWeight: 900, fontSize: 8 }}>{impuestos.titulo}</td>
      </tr></tbody></table>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead>
        <tr style={{ background: c1, color: 'white' }}>{vis.map((c,i) => <th key={i} style={{ padding: '1px 2px', textAlign: c.alineacion }}>{c.nombre}</th>)}</tr>
      </thead><tbody>
        {['Servicio A','Material B'].map(n => <tr key={n}>{vis.map((c,i) => <td key={i} style={{ padding: '1px 2px', textAlign: c.alineacion }}>{c.tipo === 'texto' ? n : `50.00 ${mon}`}</td>)}</tr>)}
      </tbody></table>
      <div style={{ textAlign: 'right', marginTop: 2, fontWeight: 800, color: c1 }}>TOTAL: 100.00 {mon}</div>
    </div>
  );
}

function ExcelUpload({ token, toast, onBack }) {
  const [nombre, setNombre] = useState('');
  const [file, setFile] = useState(null);

  const subir = async () => {
    if (!nombre.trim()) { toast('Indica nombre', 'warn'); return; }
    if (!file) { toast('Selecciona archivo', 'warn'); return; }
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('file', file);
    fd.append('config_json', '{}');
    try {
      const r = await apiFetch(`${API_URL}/plantillas/upload-excel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { toast('Plantilla subida', 'success'); onBack(); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error de conexión', 'error'); }
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Nombre</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></div>
      <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Archivo Excel</label>
        <input type="file" accept=".xlsx,.xlsm" onChange={e => setFile(e.target.files[0])} className="text-sm" /></div>
      <button onClick={subir} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg">Subir plantilla</button>
    </div>
  );
}
