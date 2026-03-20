import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL, COL_PRESETS } from '../config';
import BuilderLayout, { PaletteBlock, CanvasSection } from '../components/BuilderLayout';
import LivePreview from '../components/LivePreview';

const SECTIONS = {
  empresa: { icon: 'business', label: 'Datos empresa', color: 'blue' },
  estilo: { icon: 'palette', label: 'Estilo y página', color: 'violet' },
  cliente: { icon: 'person', label: 'Sección cliente', color: 'emerald' },
  columnas: { icon: 'view_column', label: 'Columnas tabla', color: 'blue' },
  impuestos: { icon: 'percent', label: 'Impuestos / moneda', color: 'amber' },
  pie: { icon: 'article', label: 'Pie de página', color: 'slate' },
  detalle: { icon: 'auto_awesome', label: 'Hoja de detalle', color: 'violet' },
};

export default function CrearPlantilla({ editingId, onBack }) {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('visual');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState({ nombre: '', cif: '', direccion: '', telefono: '', email: '', logo_url: '' });
  const [estilo, setEstilo] = useState({ color_primario: '#1a2e4a', color_secundario: '#0d6dfd', fuente: 'Helvetica, Arial, sans-serif', tam_fuente: 10 });
  const [pagina, setPagina] = useState({ size: 'A4', orientation: 'portrait', margenes: { top: 20, right: 15 }, escala: 100, interlineado: 1.5 });
  const [clienteMostrar, setClienteMostrar] = useState(true);
  const [columnas, setColumnas] = useState(COL_PRESETS.simple);
  const [impuestos, setImpuestos] = useState({ titulo: 'FACTURA', nombre: 'IVA', porcentaje: 21, moneda: '€', desglose: true });
  const [pie, setPie] = useState({ texto: '', mostrar_datos_pago: false, datos_pago: '' });
  const [detalle, setDetalle] = useState({ activar: false, titulo: 'Detalle' });
  const [activeSections, setActiveSections] = useState(['empresa', 'columnas', 'impuestos']);

  // Load for editing
  useEffect(() => {
    if (!editingId || !token) return;
    (async () => {
      try {
        const r = await apiFetch(`${API_URL}/plantillas/${editingId}`, { headers: authHeaders(token) });
        if (!r.ok) return;
        const p = await r.json();
        if (p.tipo !== 'visual') { toast('Solo plantillas visuales', 'info'); return; }
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
        setActiveSections(Object.keys(SECTIONS));
      } catch { toast('Error cargando', 'error'); }
    })();
  }, [editingId, token]);

  const buildConfig = () => ({
    empresa, estilo, pagina, cliente: { mostrar: clienteMostrar }, columnas,
    titulo: impuestos.titulo, moneda: impuestos.moneda, mostrar_desglose: impuestos.desglose,
    impuestos: [{ nombre: impuestos.nombre, porcentaje: impuestos.porcentaje }],
    pie, hoja_detalle: detalle,
  });

  const previewConfig = useMemo(buildConfig, [empresa, estilo, pagina, clienteMostrar, columnas, impuestos, pie, detalle]);

  const guardar = async () => {
    if (!nombre.trim()) { toast('Indica un nombre', 'warn'); return; }
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('config_json', JSON.stringify(buildConfig()));
    try {
      const url = editingId ? `${API_URL}/plantillas/${editingId}` : `${API_URL}/plantillas/crear-visual`;
      const r = await apiFetch(url, { method: editingId ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { toast(editingId ? 'Actualizada' : 'Guardada', 'success'); onBack(); }
      else toast('Error al guardar', 'error');
    } catch { toast('Error de conexión', 'error'); }
  };

  const addSection = (key) => {
    if (!activeSections.includes(key)) setActiveSections([...activeSections, key]);
  };
  const removeSection = (key) => setActiveSections(activeSections.filter(k => k !== key));

  const cargarPreset = (key) => setColumnas([...COL_PRESETS[key]]);
  const addCol = () => setColumnas([...columnas, { nombre: '', campo: '', alineacion: 'left', tipo: 'texto', formula: '' }]);
  const removeCol = (idx) => setColumnas(columnas.filter((_, i) => i !== idx));
  const updateCol = (idx, field, val) => { const n = [...columnas]; n[idx] = { ...n[idx], [field]: val }; setColumnas(n); };

  const Inp = ({ label, value, onChange, ...props }) => (
    <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-slate-500">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:ring-primary focus:border-primary" {...props} /></div>
  );

  if (tab === 'excel') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-xl font-bold">Subir Excel</h2>
        <button onClick={() => setTab('visual')} className="ml-auto text-sm text-primary font-bold hover:underline">Cambiar a Visual</button>
      </header>
      <ExcelUpload token={token} toast={toast} onBack={onBack} />
    </div>
  );

  // Palette
  const paletteContent = (
    <div className="space-y-1">
      <p className="text-[10px] text-slate-400 px-1 mb-2">Haz clic para añadir secciones</p>
      {Object.entries(SECTIONS).map(([key, sec]) => (
        <PaletteBlock key={key} icon={sec.icon} label={sec.label} color={sec.color}
          onClick={() => addSection(key)} />
      ))}
      <div className="border-t border-slate-100 mt-3 pt-3">
        <PaletteBlock icon="upload_file" label="Subir Excel" color="emerald"
          onClick={() => setTab('excel')} />
      </div>
    </div>
  );

  // Canvas
  const canvasContent = (
    <div className="space-y-4">
      {/* Nombre */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <Inp label="Nombre de la plantilla" value={nombre} onChange={setNombre} placeholder="Ej: Factura servicios" />
      </div>

      {activeSections.includes('empresa') && (
        <CanvasSection title="Datos empresa" icon="business" onRemove={() => removeSection('empresa')}>
          <div className="grid grid-cols-2 gap-3">
            {[['nombre','Nombre'],['cif','CIF/NIF'],['direccion','Dirección'],['telefono','Teléfono'],['email','Email'],['logo_url','URL Logo']].map(([k,l]) => (
              <Inp key={k} label={l} value={empresa[k]} onChange={v => setEmpresa({...empresa, [k]: v})} />
            ))}
          </div>
        </CanvasSection>
      )}

      {activeSections.includes('estilo') && (
        <CanvasSection title="Estilo y página" icon="palette" onRemove={() => removeSection('estilo')}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-slate-500">Color 1</label>
              <input type="color" value={estilo.color_primario} onChange={e => setEstilo({...estilo, color_primario: e.target.value})} className="w-full h-10 rounded-lg border-slate-200 cursor-pointer" /></div>
            <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-slate-500">Color 2</label>
              <input type="color" value={estilo.color_secundario} onChange={e => setEstilo({...estilo, color_secundario: e.target.value})} className="w-full h-10 rounded-lg border-slate-200 cursor-pointer" /></div>
            <Inp label="Tamaño texto" type="number" value={estilo.tam_fuente} onChange={v => setEstilo({...estilo, tam_fuente: parseInt(v)||10})} />
            <Inp label="Interlineado" type="number" value={pagina.interlineado} onChange={v => setPagina({...pagina, interlineado: parseFloat(v)||1.4})} />
          </div>
        </CanvasSection>
      )}

      {activeSections.includes('cliente') && (
        <CanvasSection title="Sección cliente" icon="person" onRemove={() => removeSection('cliente')}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={clienteMostrar} onChange={e => setClienteMostrar(e.target.checked)} className="rounded text-primary" />
            Mostrar sección de cliente en la factura
          </label>
        </CanvasSection>
      )}

      {activeSections.includes('columnas') && (
        <CanvasSection title="Columnas tabla" icon="view_column" onRemove={() => removeSection('columnas')} defaultOpen={true}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-slate-400">Preset:</span>
            {['simple','detallado','servicios'].map(k => (
              <button key={k} onClick={() => cargarPreset(k)} className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-primary/10 hover:text-primary transition-colors capitalize">{k}</button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1fr_65px_85px_1fr_24px] gap-1.5 mb-1.5 px-0.5">
            {['Nombre','ID','Alin.','Tipo','Fórmula',''].map(h => <span key={h} className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{h}</span>)}
          </div>
          {columnas.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_65px_85px_1fr_24px] gap-1.5 items-center mb-1">
              <input value={c.nombre} onChange={e => updateCol(i,'nombre',e.target.value)} placeholder="Nombre" className="rounded-md border-slate-200 bg-slate-50 px-2 py-1.5 text-xs" />
              <input value={c.campo} onChange={e => updateCol(i,'campo',e.target.value)} placeholder="id" className="rounded-md border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono text-slate-500" />
              <select value={c.alineacion} onChange={e => updateCol(i,'alineacion',e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-1 py-1.5 text-xs">
                <option value="left">Izq</option><option value="center">Cen</option><option value="right">Der</option>
              </select>
              <select value={c.tipo} onChange={e => updateCol(i,'tipo',e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-1 py-1.5 text-xs">
                <option value="texto">Texto</option><option value="numero">Nº</option><option value="moneda">€</option><option value="formula">ƒx</option>
              </select>
              {c.tipo === 'formula' ? (
                <input value={c.formula||''} onChange={e => updateCol(i,'formula',e.target.value)} placeholder="=cant*precio" className="rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700" />
              ) : <span />}
              <button onClick={() => removeCol(i)} className="text-slate-300 hover:text-red-500 flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          ))}
          <button onClick={addCol} className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Columna
          </button>
        </CanvasSection>
      )}

      {activeSections.includes('impuestos') && (
        <CanvasSection title="Impuestos y moneda" icon="percent" onRemove={() => removeSection('impuestos')}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Inp label="Título factura" value={impuestos.titulo} onChange={v => setImpuestos({...impuestos, titulo: v})} />
            <Inp label="Impuesto" value={impuestos.nombre} onChange={v => setImpuestos({...impuestos, nombre: v})} />
            <Inp label="%" type="number" value={impuestos.porcentaje} onChange={v => setImpuestos({...impuestos, porcentaje: parseFloat(v)||0})} />
            <Inp label="Moneda" value={impuestos.moneda} onChange={v => setImpuestos({...impuestos, moneda: v})} />
          </div>
        </CanvasSection>
      )}

      {activeSections.includes('pie') && (
        <CanvasSection title="Pie de página" icon="article" onRemove={() => removeSection('pie')}>
          <Inp label="Texto del pie" value={pie.texto} onChange={v => setPie({...pie, texto: v})} />
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={pie.mostrar_datos_pago} onChange={e => setPie({...pie, mostrar_datos_pago: e.target.checked})} className="rounded text-primary" />
            Mostrar datos de pago
          </label>
          {pie.mostrar_datos_pago && <Inp label="Datos de pago" value={pie.datos_pago} onChange={v => setPie({...pie, datos_pago: v})} />}
        </CanvasSection>
      )}

      {activeSections.includes('detalle') && (
        <CanvasSection title="Hoja de detalle" icon="auto_awesome" onRemove={() => removeSection('detalle')}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={detalle.activar} onChange={e => setDetalle({...detalle, activar: e.target.checked})} className="rounded text-primary" />
            Generar hoja de detalle por cada línea
          </label>
          {detalle.activar && <Inp label="Título" value={detalle.titulo} onChange={v => setDetalle({...detalle, titulo: v})} />}
        </CanvasSection>
      )}
    </div>
  );

  const actionButtons = (
    <button onClick={guardar} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2 text-sm">
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Actualizar' : 'Guardar'}
    </button>
  );

  return (
    <BuilderLayout
      title={editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}
      subtitle={nombre || 'Sin nombre'}
      onBack={onBack}
      palette={paletteContent}
      canvas={canvasContent}
      preview={<LivePreview config={previewConfig} />}
      actions={actionButtons}
    />
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