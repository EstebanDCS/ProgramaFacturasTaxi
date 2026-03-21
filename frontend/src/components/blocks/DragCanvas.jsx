import { useState } from 'react';
import {
  DndContext, closestCenter, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BLOCK_TYPES, CATEGORIES, createBlock } from '../../utils/blockTypes';
import BlockRenderer from './BlockRenderer';


function PaletteItem({ typeKey, typeDef, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${typeKey}`, data: { type: 'palette', typeKey },
  });
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-300',
    violet: 'bg-violet-50 text-violet-600 border-violet-100 hover:border-violet-300',
    slate: 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-300',
    coral: 'bg-orange-50 text-orange-600 border-orange-100 hover:border-orange-300',
  };
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd(typeKey)}
      className={`w-full flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing text-left transition-all ${colors[typeDef.color] || colors.slate} ${isDragging ? 'opacity-40' : ''}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{typeDef.icon}</span>
      <span className="text-[11px] font-bold truncate">{typeDef.label}</span>
    </div>
  );
}

export function BlockPalette({ onAddBlock }) {
  const [expandedCat, setExpandedCat] = useState('section');
  return (
    <div className="space-y-2">
      {CATEGORIES.map(cat => (
        <div key={cat.id}>
          <button onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{cat.icon}</span>
            <span className="flex-1 text-left">{cat.label}</span>
            <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 14, transform: expandedCat === cat.id ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }}>expand_more</span>
          </button>
          {expandedCat === cat.id && (
            <div className="ml-1 mt-1 space-y-1">
              {Object.entries(BLOCK_TYPES).filter(([_, t]) => t.category === cat.id).map(([key, t]) => (
                <PaletteItem key={key} typeKey={key} typeDef={t} onAdd={onAddBlock} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ── Visual block representation (what it looks like on the "page") ──
function BlockVisual({ block, estilo }) {
  const c1 = estilo?.color_primario || '#1a2e4a';
  const c2 = estilo?.color_secundario || '#0d6dfd';
  const cfg = block.config;

  switch (block.type) {
    case 'header':
      return (
        <div className="flex justify-between items-start py-2">
          <div>
            {cfg.logo_url && <div className="w-12 h-4 bg-slate-200 rounded mb-1" />}
            <div className="font-extrabold text-sm" style={{ color: c1 }}>{cfg.nombre || 'Empresa'}</div>
            <div className="text-[9px] text-slate-400">{[cfg.cif, cfg.direccion].filter(Boolean).join(' · ') || 'CIF · Dirección'}</div>
          </div>
          <div className="text-right">
            <div className="font-black text-lg" style={{ color: c2 }}>FACTURA</div>
            <div className="text-[9px] text-slate-400">Nº: 2026-0001</div>
          </div>
        </div>
      );

    case 'client':
      return cfg.mostrar !== false ? (
        <div className="bg-slate-50 rounded px-3 py-2 text-[10px]">
          <div className="text-[8px] font-bold text-slate-400 mb-0.5">FACTURAR A:</div>
          <div className="text-slate-600">Empresa Ejemplo S.L.</div>
        </div>
      ) : <div className="text-[10px] text-slate-300 italic">Cliente oculto</div>;

    case 'items_table': {
      const cols = (cfg.columnas || []).filter(c => !c.oculta);
      return (
        <div>
          <div className="flex rounded-t overflow-hidden" style={{ backgroundColor: c1 }}>
            {cols.map((c, i) => <div key={i} className="flex-1 px-2 py-1 text-[8px] font-bold text-white" style={{ textAlign: c.alineacion }}>{c.nombre}</div>)}
          </div>
          {['Servicio profesional', 'Material fungible'].map((n, i) => (
            <div key={i} className={`flex ${i % 2 ? 'bg-slate-50' : ''}`}>
              {cols.map((c, j) => <div key={j} className="flex-1 px-2 py-0.5 text-[8px] text-slate-600" style={{ textAlign: c.alineacion }}>{c.tipo === 'texto' ? n : '50.00 €'}</div>)}
            </div>
          ))}
        </div>
      );
    }

    case 'totals':
      return (
        <div className="flex flex-col items-end text-[9px] py-1">
          {cfg.mostrar_desglose !== false && <>
            <div className="flex gap-4"><span className="text-slate-400">Subtotal</span><b>530.00 {cfg.moneda || '€'}</b></div>
            <div className="flex gap-4"><span className="text-slate-400">{cfg.impuestos?.[0]?.nombre || 'IVA'} ({cfg.impuestos?.[0]?.porcentaje || 21}%)</span><b>111.30 {cfg.moneda || '€'}</b></div>
          </>}
          <div className="flex gap-4 mt-1 pt-1 border-t-2" style={{ borderColor: c1 }}>
            <span className="font-black" style={{ color: c1 }}>TOTAL</span>
            <b style={{ color: c1 }}>641.30 {cfg.moneda || '€'}</b>
          </div>
        </div>
      );

    case 'notes':
      return <div className="text-[9px] text-slate-400 italic py-1">{cfg.placeholder || 'Notas...'}</div>;

    case 'footer':
      return (
        <div className="text-[9px] text-slate-400 border-t border-slate-200 pt-1">
          {cfg.texto || 'Pie de página'}{cfg.mostrar_datos_pago && cfg.datos_pago ? ` · ${cfg.datos_pago}` : ''}
        </div>
      );

    case 'detail_sheet':
      if (!cfg.activar) return <div className="text-[9px] text-slate-300 italic">Tickets desactivados</div>;
      return (
        <div className="border border-violet-200 rounded-lg overflow-hidden">
          <div className="bg-violet-600 text-white px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold">{cfg.titulo || 'Ticket'}</span>
            <span className="text-[8px] opacity-70">× N hojas</span>
          </div>
          <div className="bg-violet-50/50 px-3 py-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(cfg.campos || []).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[8px] text-violet-400">
                    {c.tipo === 'checkbox' ? '☑' : c.tipo === 'dropdown' ? '▾' : c.tipo === 'fecha' ? '📅' : c.tipo === 'moneda' ? '€' : c.tipo === 'numero' ? '#' : '—'}
                  </span>
                  <span className="text-[9px] text-violet-700 font-medium">{c.nombre}</span>
                </div>
              ))}
            </div>
            {!(cfg.campos || []).length && <span className="text-[9px] text-violet-300 italic">Sin campos definidos</span>}
          </div>
        </div>
      );

    default:
      return <div className="text-[9px] text-slate-400">{BLOCK_TYPES[block.type]?.label || block.type}</div>;
  }
}


// ── Sortable page block (visual + click to edit) ──
function SortablePageBlock({ block, estilo, isSelected, onSelect, onUpdate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const typeDef = BLOCK_TYPES[block.type] || {};
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`relative group mb-1 rounded-lg transition-all cursor-grab active:cursor-grabbing
        ${isSelected ? 'ring-2 ring-primary bg-blue-50/30' : 'hover:bg-slate-50/50'}`}
      onClick={() => onSelect(block.id)}>

      {/* Delete button */}
      <button onClick={e => { e.stopPropagation(); onRemove(); }} onPointerDown={e => e.stopPropagation()}
        className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 bg-white border border-slate-200 rounded-full w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-all z-10">
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
      </button>

      {/* Visual representation */}
      <div className="px-3 py-2">
        <BlockVisual block={block} estilo={estilo} />
      </div>

      {/* Inline editor (when selected) */}
      {isSelected && (
        <div className="border-t border-primary/20 bg-blue-50/50 px-4 py-3 rounded-b-lg cursor-default"
          onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>{typeDef.icon}</span>
            <span className="text-xs font-bold text-primary">Editar: {typeDef.label}</span>
          </div>
          <BlockRenderer block={block} onChange={newConfig => onUpdate(newConfig)} />
        </div>
      )}
    </div>
  );
}


function CanvasDropZone({ children, isEmpty, isOver }) {
  return (
    <div className={`transition-colors ${isOver ? 'ring-2 ring-primary/20' : ''}`}>
      {isEmpty ? (
        <div className={`flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl ${isOver ? 'border-primary bg-primary/5' : 'border-slate-200'} text-slate-300`}>
          <span className="material-symbols-outlined text-3xl mb-2">{isOver ? 'download' : 'add_circle'}</span>
          <p className="text-xs font-medium">{isOver ? 'Suelta aquí' : 'Arrastra bloques o haz clic en la paleta'}</p>
        </div>
      ) : children}
    </div>
  );
}


export function DragCanvas({ blocks, onChange, paletteContent, estilo }) {
  const [draggingType, setDraggingType] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: 'canvas-drop' });

  const handleDragStart = (e) => { if (e.active.data.current?.type === 'palette') setDraggingType(e.active.data.current.typeKey); };
  const handleDragEnd = (e) => {
    const { active, over } = e;
    setDraggingType(null);
    if (active.data.current?.type === 'palette') {
      if (over) { const b = createBlock(active.data.current.typeKey); if (b) onChange([...blocks, b]); }
      return;
    }
    if (over && active.id !== over.id) {
      const oi = blocks.findIndex(b => b.id === active.id), ni = blocks.findIndex(b => b.id === over.id);
      if (oi >= 0 && ni >= 0) { onChange(arrayMove(blocks, oi, ni)); }
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Palette */}
        {paletteContent && (
          <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto">
            <div className="p-3 border-b border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bloques</p></div>
            <div className="p-2">{paletteContent}</div>
          </div>
        )}

        {/* Page canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto" ref={dropRef}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg mx-auto p-6 min-h-[500px]" style={{ maxWidth: 680 }}>
            <CanvasDropZone isEmpty={!blocks.length} isOver={isOver}>
              <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map(block => (
                  <SortablePageBlock key={block.id} block={block} estilo={estilo}
                    isSelected={selectedId === block.id}
                    onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
                    onUpdate={cfg => onChange(blocks.map(b => b.id === block.id ? { ...b, config: cfg } : b))}
                    onRemove={() => { onChange(blocks.filter(b => b.id !== block.id)); if (selectedId === block.id) setSelectedId(null); }} />
                ))}
              </SortableContext>
            </CanvasDropZone>
          </div>
        </div>
      </div>

      <DragOverlay>{draggingType && (
        <div className="bg-white border border-primary shadow-xl rounded-xl px-4 py-3 flex items-center gap-2 opacity-90 pointer-events-none w-52">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{BLOCK_TYPES[draggingType]?.icon}</span>
          <span className="text-sm font-bold text-slate-800">{BLOCK_TYPES[draggingType]?.label}</span>
        </div>
      )}</DragOverlay>
    </DndContext>
  );
}