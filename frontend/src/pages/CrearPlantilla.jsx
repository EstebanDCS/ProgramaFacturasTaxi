import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch, authHeaders } from '../utils/api';
import { API_URL } from '../config';
import { DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { BlockPalette, DropCanvas } from '../components/blocks/DragCanvas';
import { BLOCK_TYPES, createBlock } from '../utils/blockTypes';

export default function CrearPlantilla({ editingId, onBack }) {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('visual');
  const [nombre, setNombre] = useState('');
  const [estilo, setEstilo] = useState({ color_primario: '#1a2e4a', color_secundario: '#0d6dfd', tam_fuente: 10 });
  const [blocks, setBlocks] = useState([]);
  const [ticketsOn, setTicketsOn] = useState(false);
  const [ticketBlocks, setTicketBlocks] = useState([]);
  const [ticketNombre, setTicketNombre] = useState('Ticket');
  const [activeCanvas, setActiveCanvas] = useState('main');
  const [draggingType, setDraggingType] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!editingId && blocks.length === 0) {
      setBlocks([createBlock('header'), createBlock('client'), createBlock('items_table'), createBlock('totals'), createBlock('notes')]);
    }
  }, []);

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
        if (cfg.estilo) setEstilo(prev => ({ ...prev, ...cfg.estilo }));
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
        loaded.push(createBlock('notes'));
        if (loaded.length) setBlocks(loaded);
        if (cfg.hoja_detalle?.activar) {
          setTicketsOn(true);
          setTicketNombre(cfg.hoja_detalle.titulo || 'Ticket');
          if (cfg.hoja_detalle.bloques?.length) {
            setTicketBlocks(cfg.hoja_detalle.bloques.map(b => { const nb = createBlock(b.type); if (nb) nb.config = b.config; return nb; }).filter(Boolean));
          }
        }
      } catch { toast('Error cargando', 'error'); }
    })();
  }, [editingId, token]);

  const buildConfig = () => {
    const cfg = { estilo };
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
      }
    });
    if (ticketsOn) {
      cfg.hoja_detalle = {
        activar: true, titulo: ticketNombre,
        bloques: ticketBlocks.map(b => ({ type: b.type, config: b.config })),
        campos: ticketBlocks.filter(b => ['text_field','number_field','currency_field','date_field','dropdown','checkbox'].includes(b.type)).map(b => ({
          nombre: b.config.label || '', campo: b.config.campo || '',
          tipo: b.type === 'currency_field' ? 'moneda' : b.type === 'number_field' ? 'numero' : b.type === 'date_field' ? 'fecha' : b.type === 'dropdown' ? 'dropdown' : b.type === 'checkbox' ? 'checkbox' : 'texto',
          opciones: b.config.opciones,
        })),
      };
    }
    // Tag mapping for Excel (campo → {{campo}})
    const allBlocks = [...blocks, ...ticketBlocks];
    const tagMapping = allBlocks
      .filter(b => b.config?.campo)
      .map(b => ({ campo: b.config.campo, label: b.config.label || b.config.campo, tipo: b.type }));
    if (tagMapping.length) cfg.tag_mapping = tagMapping;

    return cfg;
  };

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

  // ── Compute available formula variables from template config ──
  const formulaVariables = useMemo(() => {
    const vars = [];

    // Globals
    vars.push({ key: 'subtotal', desc: 'Suma total de líneas', type: 'global' });
    if (ticketsOn) vars.push({ key: 'tickets_count', desc: 'Nº de tickets', type: 'global' });

    // Line column aggregates (only numeric types)
    const tableBlock = blocks.find(b => b.type === 'items_table');
    (tableBlock?.config?.columnas || []).forEach(c => {
      if (!c.campo) return;
      if (c.tipo === 'numero' || c.tipo === 'moneda' || c.tipo === 'formula') {
        vars.push({ key: `lineas_sum_${c.campo}`, desc: `Suma columna "${c.nombre}"`, type: 'ready' });
      }
    });

    // Ticket field aggregates (composed, ready to use)
    if (ticketsOn) {
      ticketBlocks.forEach(b => {
        const campo = b.config?.campo;
        const label = b.config?.label || campo;
        if (!campo) return;

        if (['number_field', 'currency_field'].includes(b.type)) {
          vars.push(
            { key: `tickets_sum_${campo}`, desc: `Suma "${label}" de tickets`, type: 'ready' },
            { key: `tickets_avg_${campo}`, desc: `Media "${label}" de tickets`, type: 'ready' },
            { key: `tickets_min_${campo}`, desc: `Mínimo "${label}" de tickets`, type: 'ready' },
            { key: `tickets_max_${campo}`, desc: `Máximo "${label}" de tickets`, type: 'ready' },
          );
        }
        if (b.type === 'date_field') {
          vars.push(
            { key: `tickets_min_${campo}`, desc: `Fecha más antigua "${label}"`, type: 'ready', isDate: true },
            { key: `tickets_max_${campo}`, desc: `Fecha más reciente "${label}"`, type: 'ready', isDate: true },
          );
        }
      });
    }

    return vars;
  }, [blocks, ticketBlocks, ticketsOn]);

  const addBlock = (typeKey) => {
    const b = createBlock(typeKey);
    if (!b) return;
    if (activeCanvas === 'ticket' && ticketsOn) setTicketBlocks([...ticketBlocks, b]);
    else setBlocks([...blocks, b]);
    toast(`${BLOCK_TYPES[typeKey]?.label} añadido`, 'info');
  };

  // ── Shared drag handlers ──
  const handleDragStart = (e) => {
    if (e.active.data.current?.origin === 'palette') setDraggingType(e.active.data.current.typeKey);
  };

  const handleDragEnd = (e) => {
    const { active, over } = e;
    setDraggingType(null);
    if (!over) return;

    // From palette → insertion zone or canvas
    if (active.data.current?.origin === 'palette') {
      const newBlock = createBlock(active.data.current.typeKey);
      if (!newBlock) return;
      const target = String(over.id);

      // Dropped on an insertion zone: "main-insert-N" or "ticket-insert-N"
      if (target.includes('-insert-')) {
        const idx = parseInt(target.split('-insert-')[1]) || 0;
        if (target.startsWith('ticket')) {
          setTicketBlocks(prev => { const n = [...prev]; n.splice(idx, 0, newBlock); return n; });
        } else {
          setBlocks(prev => { const n = [...prev]; n.splice(idx, 0, newBlock); return n; });
        }
      }
      // Dropped on canvas itself
      else if (target === 'ticket-canvas') {
        setTicketBlocks(prev => [...prev, newBlock]);
      } else {
        setBlocks(prev => [...prev, newBlock]);
      }
      toast(`${BLOCK_TYPES[active.data.current.typeKey]?.label} añadido`, 'info');
      return;
    }

    // Reorder within canvas
    if (active.id === over.id) return;
    const inMain = blocks.findIndex(b => b.id === active.id);
    const inTicket = ticketBlocks.findIndex(b => b.id === active.id);
    if (inMain >= 0) {
      const ni = blocks.findIndex(b => b.id === over.id);
      if (ni >= 0) setBlocks(arrayMove(blocks, inMain, ni));
    } else if (inTicket >= 0) {
      const ni = ticketBlocks.findIndex(b => b.id === over.id);
      if (ni >= 0) setTicketBlocks(arrayMove(ticketBlocks, inTicket, ni));
    }
  };

  if (tab === 'excel') return (
    <div className="animate-fadeIn w-full max-w-[1400px]">
      <header className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-xl font-bold">Subir Excel</h2>
        <button onClick={() => setTab('visual')} className="ml-auto text-sm text-primary font-bold hover:underline">Visual</button>
      </header>
      <ExcelUpload token={token} toast={toast} onBack={onBack} onImportBlocks={(newBlocks, excelNombre) => {
        setBlocks(prev => [...prev, ...newBlocks]);
        if (excelNombre && !nombre) setNombre(excelNombre);
        setTab('visual');
      }} />
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          <div className="flex items-center gap-3">
            <button onClick={() => { const next = !ticketsOn; setTicketsOn(next); if (next && !ticketBlocks.length) setTicketBlocks([createBlock('text_field'), createBlock('currency_field')]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${ticketsOn ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{ticketsOn ? 'check_circle' : 'add_circle'}</span>
              Tickets
            </button>
            <button onClick={guardar} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Palette */}
          <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bloques</p>
              {ticketsOn && (
                <div className="flex gap-1">
                  <button onClick={() => setActiveCanvas('main')} className={`text-[10px] font-bold px-2 py-0.5 rounded ${activeCanvas === 'main' ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-100'}`}>Factura</button>
                  <button onClick={() => setActiveCanvas('ticket')} className={`text-[10px] font-bold px-2 py-0.5 rounded ${activeCanvas === 'ticket' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}>Ticket</button>
                </div>
              )}
            </div>
            <div className="p-2">
              <BlockPalette onAddBlock={addBlock} />
              <div className="border-t border-slate-100 mt-3 pt-3 px-1">
                <button onClick={() => setTab('excel')}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600 text-left hover:border-emerald-300 transition-all">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
                  <span className="text-[11px] font-bold">Subir Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 min-w-0 overflow-y-auto space-y-6">
            {/* Style bar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
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

            {/* Main canvas */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>description</span>
                <span className="text-sm font-bold text-slate-700">Hoja de factura</span>
              </div>
              <DropCanvas canvasId="main" blocks={blocks} onChange={setBlocks} estilo={estilo} isDraggingFromPalette={!!draggingType} formulaVariables={formulaVariables} />
            </div>

            {/* Ticket canvas */}
            {ticketsOn && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-violet-600" style={{ fontSize: 18 }}>auto_awesome</span>
                  <span className="text-sm font-bold text-violet-700">Hoja de ticket</span>
                  <span className="text-xs text-violet-400">— cada ticket usa este diseño</span>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-violet-500">Nombre:</label>
                    <input value={ticketNombre} onChange={e => setTicketNombre(e.target.value)}
                      className="rounded-lg border-violet-200 bg-violet-50 px-2 py-1 text-sm text-violet-700 w-32" />
                  </div>
                </div>
                <DropCanvas canvasId="ticket" blocks={ticketBlocks} onChange={setTicketBlocks} estilo={estilo} isTicket isDraggingFromPalette={!!draggingType} formulaVariables={formulaVariables} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay ghost */}
      <DragOverlay>{draggingType && (
        <div className="bg-white border-2 border-primary shadow-2xl rounded-xl px-4 py-3 flex items-center gap-2 opacity-90 pointer-events-none w-52">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{BLOCK_TYPES[draggingType]?.icon}</span>
          <span className="text-sm font-bold text-slate-800">{BLOCK_TYPES[draggingType]?.label}</span>
        </div>
      )}</DragOverlay>
    </DndContext>
  );
}

function ExcelUpload({ token, toast, onBack, onImportBlocks }) {
  const [nombre, setNombre] = useState('');
  const [file, setFile] = useState(null);
  const [tagResult, setTagResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Auto-scan when file selected
  const handleFile = async (f) => {
    setFile(f);
    if (!f) { setTagResult(null); return; }
    setScanning(true);
    try {
      const XLSX = await import('xlsx');
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const tagPattern = /\{\{([^}]+)\}\}/g;
      const tagMap = {};
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell?.v) continue;
            let m; tagPattern.lastIndex = 0;
            while ((m = tagPattern.exec(String(cell.v))) !== null) {
              const tag = m[1].trim();
              if (!tagMap[tag]) tagMap[tag] = { tag, sheets: new Set(), count: 0 };
              tagMap[tag].sheets.add(name);
              tagMap[tag].count++;
            }
          }
        }
      });
      const tags = Object.values(tagMap).map(t => ({ ...t, sheets: [...t.sheets] }));
      setTagResult({ tags, sheetCount: wb.SheetNames.length });
    } catch { setTagResult({ tags: [], error: true }); }
    setScanning(false);
  };

  const guessType = (tag) => {
    const t = tag.toLowerCase();
    if (t.includes('fecha') || t.includes('date')) return 'date_field';
    if (t.includes('importe') || t.includes('total') || t.includes('precio') || t.includes('amount') || t.includes('eur') || t.includes('coste') || t.includes('base_imponible') || t.includes('iva')) return 'currency_field';
    if (t.includes('cantidad') || t.includes('horas') || t.includes('km')) return 'number_field';
    // Checkbox: o_X / d_X (origin/destination) but NOT _texto, also ida_vuelta, si_no, activo, check
    if (t === 'ida_vuelta' || t.includes('check') || t.includes('si_no') || t.includes('activo')) return 'checkbox';
    if (/^[od]_/.test(t) && !t.endsWith('_texto')) return 'checkbox';
    return 'text_field';
  };

  const importAsBlocks = () => {
    if (!tagResult?.tags?.length || !onImportBlocks) return;
    const newBlocks = tagResult.tags.map(t => {
      const type = guessType(t.tag);
      const b = createBlock(type);
      if (b) { b.config.label = t.tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); b.config.campo = t.tag; }
      return b;
    }).filter(Boolean);
    onImportBlocks(newBlocks, nombre);
    toast(`${newBlocks.length} bloques creados desde Excel`, 'success');
  };

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

  const BTYPES = { text_field: 'Texto', number_field: 'Número', currency_field: 'Moneda', date_field: 'Fecha', checkbox: 'Check ✓' };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" placeholder="Mi plantilla Excel" /></div>
        <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-500">Archivo Excel</label>
          <input type="file" accept=".xlsx,.xlsm" onChange={e => handleFile(e.target.files[0])} className="text-sm" /></div>
      </div>

      {scanning && <div className="flex items-center gap-2 text-sm text-slate-400"><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>refresh</span> Escaneando tags...</div>}

      {/* Tags found */}
      {tagResult && !tagResult.error && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 18 }}>{tagResult.tags.length ? 'check_circle' : 'info'}</span>
              <span className="text-sm font-bold text-slate-700">
                {tagResult.tags.length ? `${tagResult.tags.length} tags encontrados` : 'No se encontraron tags {{...}}'}
              </span>
            </div>
            {tagResult.tags.length > 0 && onImportBlocks && (
              <button onClick={importAsBlocks}
                className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_fix_high</span>
                Importar como bloques
              </button>
            )}
          </div>
          {tagResult.tags.length > 0 && (
            <div className="p-3 space-y-1">
              {tagResult.tags.map(t => (
                <div key={t.tag} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
                  <code className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{`{{${t.tag}}}`}</code>
                  <span className="text-[10px] text-slate-400 flex-1">{t.sheets.join(', ')} · {t.count}×</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold">{BTYPES[guessType(t.tag)] || 'Texto'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={subir} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg text-sm flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cloud_upload</span> Subir como plantilla Excel
        </button>
        {tagResult?.tags?.length > 0 && (
          <p className="text-xs text-slate-400 flex items-center">ó usa "Importar como bloques" para editar visualmente</p>
        )}
      </div>
    </div>
  );
}