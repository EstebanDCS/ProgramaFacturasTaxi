import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';
import LivePreview from '../components/LivePreview';
import { BlockPalette, DragCanvas } from '../components/blocks/DragCanvas';
import { BLOCK_TYPES, createBlock } from '../utils/blockTypes';

export default function CrearPlantilla({ editingId, onBack }) {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('visual');
  const [nombre, setNombre] = useState('');
  const [estilo, setEstilo] = useState({ color_primario: '#1a2e4a', color_secundario: '#0d6dfd', tam_fuente: 10, interlineado: 1.5 });
  const [blocks, setBlocks] = useState([]);
  const [showPreview, setShowPreview] = useState(true);

  // Default blocks for new template
  useEffect(() => {
    if (!editingId && blocks.length === 0) {
      setBlocks([createBlock('header'), createBlock('client'), createBlock('items_table'), createBlock('totals'), createBlock('notes')]);
    }
  }, []);

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
        if (cfg.estilo) setEstilo(prev => ({ ...prev, ...cfg.estilo, interlineado: cfg.pagina?.interlineado || 1.5 }));
        const loaded = [];
        if (cfg.empresa) { const b = createBlock('header'); b.config = cfg.empresa; loaded.push(b); }
        if (cfg.cliente) { const b = createBlock('client'); b.config = cfg.cliente; loaded.push(b); }
        if (cfg.columnas) { const b = createBlock('items_table'); b.config = { columnas: cfg.columnas }; loaded.push(b); }
        if (cfg.impuestos || cfg.titulo) {
          const b = createBlock('totals');
          b.config = { titulo: cfg.titulo || 'FACTURA', moneda: cfg.moneda || '€', mostrar_desglose: cfg.mostrar_desglose !== false, impuestos: cfg.impuestos || [{ nombre: 'IVA', porcentaje: 21 }] };
          loaded.push(b);
        }
        if (cfg.pie) { const b = createBlock('footer'); b.config = cfg.pie; loaded.push(b); }
        if (cfg.hoja_detalle?.activar) { const b = createBlock('detail_sheet'); b.config = cfg.hoja_detalle; loaded.push(b); }
        if (loaded.length) setBlocks(loaded);
      } catch { toast('Error cargando', 'error'); }
    })();
  }, [editingId, token]);

  const buildConfig = () => {
    const cfg = { estilo, pagina: { interlineado: estilo.interlineado } };
    blocks.forEach(b => {
      switch (b.type) {
        case 'header': cfg.empresa = b.config; break;
        case 'client': cfg.cliente = b.config; break;
        case 'items_table': cfg.columnas = b.config.columnas; break;
        case 'totals':
          cfg.titulo = b.config.titulo; cfg.moneda = b.config.moneda;
          cfg.mostrar_desglose = b.config.mostrar_desglose; cfg.impuestos = b.config.impuestos; break;
        case 'notes': cfg.notas_placeholder = b.config.placeholder; break;
        case 'footer': cfg.pie = b.config; break;
        case 'detail_sheet': cfg.hoja_detalle = b.config; break;
      }
    });
    return cfg;
  };

  const previewConfig = useMemo(buildConfig, [blocks, estilo]);

  const guardar = async () => {
    if (!nombre.trim()) { toast('Indica un nombre', 'warn'); return; }
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('config_json', JSON.stringify(buildConfig()));
    try {
      const url = editingId ? `${API_URL}/plantillas/${editingId}` : `${API_URL}/plantillas/crear-visual`;
      const r = await apiFetch(url, { method: editingId ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { toast(editingId ? 'Actualizada' : 'Guardada', 'success'); onBack(); }
      else toast('Error', 'error');
    } catch { toast('Error de conexión', 'error'); }
  };

  const addBlock = (typeKey) => {
    setBlocks([...blocks, createBlock(typeKey)]);
    toast(`${BLOCK_TYPES[typeKey]?.label} añadido`, 'info');
  };

  if (tab === 'excel') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-xl font-bold">Subir Excel</h2>
        <button onClick={() => setTab('visual')} className="ml-auto text-sm text-primary font-bold hover:underline">Visual</button>
      </header>
      <ExcelUpload token={token} toast={toast} onBack={onBack} />
    </div>
  );

  const paletteContent = (
    <div>
      <BlockPalette onAddBlock={addBlock} />
      <div className="border-t border-slate-100 mt-3 pt-3 px-1">
        <button onClick={() => setTab('excel')}
          className="w-full flex items-center gap-2 p-2 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600 text-left hover:border-emerald-300 transition-all">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
          <span className="text-[11px] font-bold">Subir Excel</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="animate-fadeIn flex flex-col h-[calc(100vh-3rem)]">
      {/* Top bar */}
      <header className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
          <div>
            <h2 className="text-xl font-bold">{editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}</h2>
            <p className="text-xs text-slate-400">{nombre || 'Sin nombre'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(!showPreview)}
            className={`p-1.5 rounded-md transition-colors ${showPreview ? 'bg-slate-100 text-primary' : 'text-slate-400 hover:text-slate-600'}`} title="Preview">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span>
          </button>
          <button onClick={guardar} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </header>

      {/* Body: DragCanvas (palette + canvas) + optional preview */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Name + style row */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-4 flex-shrink-0">
            <div className="grid grid-cols-[1fr_70px_70px_60px] gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500">Nombre</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Factura servicios"
                  className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500">Color 1</label>
                <input type="color" value={estilo.color_primario} onChange={e => setEstilo({...estilo, color_primario: e.target.value})} className="w-full h-9 rounded-lg border-slate-200 cursor-pointer" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500">Color 2</label>
                <input type="color" value={estilo.color_secundario} onChange={e => setEstilo({...estilo, color_secundario: e.target.value})} className="w-full h-9 rounded-lg border-slate-200 cursor-pointer" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500">Txt</label>
                <input type="number" value={estilo.tam_fuente} onChange={e => setEstilo({...estilo, tam_fuente: parseInt(e.target.value)||10})} className="rounded-lg border-slate-200 bg-slate-50 px-2 py-2 text-sm" min={8} max={16} />
              </div>
            </div>
          </div>

          {/* Palette + Canvas in shared DndContext */}
          <DragCanvas blocks={blocks} onChange={setBlocks} paletteContent={paletteContent} estilo={estilo} />
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-80 flex-shrink-0 flex flex-col">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vista previa</p>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <LivePreview config={previewConfig} />
              </div>
            </div>
          </div>
        )}
      </div>
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
    fd.append('nombre', nombre); fd.append('file', file); fd.append('config_json', '{}');
    try {
      const r = await apiFetch(`${API_URL}/plantillas/upload-excel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { toast('Subida', 'success'); onBack(); }
      else { const err = await r.json().catch(() => ({})); toast(err.detail || 'Error', 'error'); }
    } catch { toast('Error', 'error'); }
  };
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Nombre</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></div>
      <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Archivo Excel</label>
        <input type="file" accept=".xlsx,.xlsm" onChange={e => setFile(e.target.files[0])} className="text-sm" /></div>
      <button onClick={subir} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg">Subir</button>
    </div>
  );
}